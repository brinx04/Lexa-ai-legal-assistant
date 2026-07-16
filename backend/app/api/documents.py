# backend/app/api/documents.py
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.db import get_db
from app.models.document import Document, DocStatus
from app.workers.tasks import process_document_pipeline
from app.core.limiter import limiter  # SlowAPI rate limiter singleton

import os
from qdrant_client.http import models as qdrant_models
from app.core.vector_db import qdrant_client, COLLECTION_NAME

import shutil
from app.core.security import verify_api_key
from app.services.event_bus import DocumentEvent, publish_document_event

# Protect the entire router with the API Key
router = APIRouter(
    prefix="/api/v1/documents",
    tags=["Documents"],
    dependencies=[Depends(verify_api_key)]
)

@router.post("/upload")
@limiter.limit("5/minute")  # ⚡ Strict: 5 uploads per IP per minute
async def upload_document(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    allowed_extensions = ["pdf", "docx", "txt", "jpg", "jpeg", "png"]
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported file format.")

    # Read the user identity injected by the Next.js proxy
    user_email = request.headers.get("x-user-email", None)

    # Save file to local uploads directory
    upload_dir = os.path.join(os.getcwd(), "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Save metadata to Postgres — stamp the owner's email for isolation
    db_doc = Document(
        filename=file.filename,
        status=DocStatus.PENDING,
        s3_path=file_path,
        user_email=user_email,  # Phase 2: ties this document to the uploading user
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    # Trigger the background worker (graceful if broker is down)
    task_queued = True
    try:
        process_document_pipeline.delay(str(db_doc.id))
    except Exception:
        task_queued = False

    # Broadcast the lifecycle event — the Go notifier pushes this to the
    # user's browser over SSE; other consumers (audit, analytics) can
    # subscribe to the same topic without touching this code.
    publish_document_event(
        DocumentEvent.UPLOADED,
        document_id=db_doc.id,
        user_email=user_email,
        filename=db_doc.filename,
        status=db_doc.status.value,
        metadata={"queued": task_queued},
    )

    return {
        "message": "Document uploaded" + (" and processing queued" if task_queued else " (worker queue unavailable, will retry)"),
        "document_id": db_doc.id,
        "status": db_doc.status
    }

@router.get("/{doc_id}")
@limiter.limit("30/minute")  # ⚡ Moderate: status polling
async def get_document_status(request: Request, doc_id: UUID, db: Session = Depends(get_db)):
    """
    Endpoint to fetch the current processing state and AI insights of a document.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "created_at": doc.created_at,
        # Return the AI fields (will be null if status is still PENDING/PROCESSING)
        "summary": doc.summary,
        "extracted_clauses": doc.extracted_clauses,
        "red_flags": doc.red_flags
    }


# --- Document List Endpoint: Scoped to the authenticated user ---
@router.get("")
@limiter.limit("30/minute")  # ⚡ Moderate: dashboard polling
async def list_all_documents(request: Request, db: Session = Depends(get_db)):
    """
    Fetches documents belonging to the authenticated user (identified by
    the X-User-Email header injected by the Next.js proxy).
    Falls back to showing all documents if no email is provided (dev mode).
    """
    user_email = request.headers.get("x-user-email", None)

    query = db.query(Document)
    if user_email:
        # Production path: only show THIS user's documents
        query = query.filter(Document.user_email == user_email)
    # else: dev/fallback — show all documents (no auth)

    docs = query.order_by(Document.created_at.desc()).all()
    return [
        {
            "document_id": doc.id,
            "filename": doc.filename,
            "status": doc.status,
            "created_at": doc.created_at
        }
        for doc in docs
    ]

# --- NEW 2: SSE Real-Time Status Streaming ---
@router.get("/{doc_id}/status/stream")
@limiter.limit("10/minute")  # ⚡ SSE connections are expensive — cap them tightly
async def stream_document_status(request: Request, doc_id: UUID, db: Session = Depends(get_db)):
    """
    Pushes real-time status updates (PENDING -> PROCESSING -> COMPLETED) 
    to the frontend so it doesn't have to constantly poll the server.
    """
    async def event_generator():
        previous_status = None
        
        while True:
            # We need a fresh query inside the loop to get the latest DB state
            doc = db.query(Document).filter(Document.id == doc_id).first()
            
            if not doc:
                yield f"data: {{\"error\": \"Document not found\"}}\n\n"
                break
            
            current_status = doc.status
            
            # Only send an event to the frontend if the status actually changed
            if current_status != previous_status:
                yield f"data: {{\"status\": \"{current_status.value}\"}}\n\n"
                previous_status = current_status
            
            # Close the stream connection once the background worker finishes
            if current_status in [DocStatus.COMPLETED, DocStatus.FAILED]:
                break
                
            # Wait 1 second before checking the database again
            await asyncio.sleep(1.0)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- NEW: Delete Document Endpoint ---
@router.delete("/{doc_id}")
@limiter.limit("10/minute")  # ⚡ Deletions are destructive — keep them rate-limited
async def delete_document(request: Request, doc_id: UUID, db: Session = Depends(get_db)):
    """
    Completely removes a document from PostgreSQL, Local Disk, and Qdrant Vector DB.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 1. Delete Physical File from Disk
    if doc.s3_path and os.path.exists(doc.s3_path):
        try:
            os.remove(doc.s3_path)
            print(f"[Cleanup] Deleted physical file: {doc.s3_path}")
        except Exception as e:
            print(f"[Cleanup Error] Failed to delete file: {str(e)}")

    # 2. Delete Vectors from Qdrant
    try:
        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="document_id",
                        match=qdrant_models.MatchValue(value=str(doc_id))
                    )
                ]
            )
        )
        print(f"[Cleanup] Wiped Qdrant vectors for document: {doc_id}")
    except Exception as e:
        print(f"[Cleanup Error] Failed to delete vectors: {str(e)}")

    # 3. Delete from PostgreSQL Database
    # Manually cascade delete chat history to prevent IntegrityErrors if DB schema lacks ON DELETE CASCADE
    from app.models.chat import ChatMessage
    db.query(ChatMessage).filter(ChatMessage.document_id == doc_id).delete()
    
    db.delete(doc)
    db.commit()

    publish_document_event(
        DocumentEvent.DELETED,
        document_id=doc_id,
        user_email=request.headers.get("x-user-email"),
        filename=doc.filename,
    )

    return {"message": f"Document {doc.filename} successfully deleted."}