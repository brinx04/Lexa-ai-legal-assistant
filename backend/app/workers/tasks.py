# backend/app/workers/tasks.py
import os
import time
import pdfplumber
from celery import shared_task
from celery_app import celery_instance  # noqa: F401 — ensures Redis broker config is loaded
from app.core.db import SessionLocal
from app.models.document import Document, DocStatus
# NOTE: lexa_brain is imported lazily inside the task to prevent import errors
# from silently breaking Celery task registration.
from app.services.embeddings import process_and_store_embeddings
from app.services.event_bus import DocumentEvent, publish_document_event


# ============================================================
# OCR FALLBACK: Activated for scanned/image-based PDFs
# Requires: Tesseract-OCR binary + Poppler bin in system PATH
# Windows Tesseract path override (uncomment if needed):
# import pytesseract
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
# ============================================================

def extract_text_from_file(file_path: str) -> str:
    """
    Extracts text from PDF, DOCX, or TXT files.

    For PDFs:
      - Step 1: Uses pdfplumber for native digital text extraction (fast, accurate).
      - Step 2: If the result is under 100 characters (scanned / image-only PDF),
                automatically falls back to OCR via pdf2image + pytesseract.

    Raises:
        FileNotFoundError: If the file path does not exist.
        ValueError: If the file format is not supported.
    """
    extracted_text = ""
    file_ext = file_path.lower()

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Could not find file at {file_path}")

    if file_ext.endswith('.pdf'):
        # ── Step 1: Native Text Extraction via pdfplumber ──
        print("[Extractor] Attempting native PDF text extraction via pdfplumber...")
        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text += page_text + "\n"
        except Exception as e:
            print(f"[Extractor Warning] pdfplumber failed: {e}. Will try OCR.")

        native_char_count = len(extracted_text.strip())
        print(f"[Extractor] Native extraction yielded {native_char_count} characters.")

        # ── Step 2: OCR Fallback for Scanned / Image PDFs ──
        if native_char_count < 100:
            print(
                f"[OCR Warning] Insufficient text ({native_char_count} chars). "
                "This looks like a scanned or image-only PDF. Triggering OCR Fallback..."
            )
            extracted_text = ""  # Clear any garbage artifacts from failed native pass

            try:
                import pytesseract
                from pdf2image import convert_from_path

                # Convert each PDF page to a PIL Image at 300 DPI for optimal OCR accuracy
                pages = convert_from_path(file_path, dpi=300)
                print(f"[OCR] Converted PDF to {len(pages)} page image(s). Running Tesseract...")

                for idx, page_image in enumerate(pages):
                    print(f"[OCR] Scanning page {idx + 1}/{len(pages)}...")
                    # lang='eng' for English; use 'eng+hin' to include Hindi (Devanagari)
                    page_text = pytesseract.image_to_string(page_image, lang='eng')
                    extracted_text += page_text + "\n"

                print(
                    f"[OCR Success] Extracted {len(extracted_text)} characters "
                    "via Tesseract image scanning."
                )

            except ImportError:
                raise RuntimeError(
                    "OCR dependencies missing. Run: pip install pytesseract pdf2image\n"
                    "Also ensure Tesseract-OCR binary and Poppler are installed and in PATH."
                )
            except Exception as ocr_error:
                raise RuntimeError(
                    f"OCR Fallback failed: {str(ocr_error)}\n"
                    "Ensure Tesseract-OCR is installed and Poppler bin is in your system PATH."
                )

    elif file_ext.endswith('.docx'):
        import docx
        print("[Extractor] Extracting text from DOCX...")
        docx_doc = docx.Document(file_path)
        extracted_text = "\n".join([para.text for para in docx_doc.paragraphs])

    elif file_ext.endswith('.txt'):
        print("[Extractor] Reading plain text file...")
        with open(file_path, 'r', encoding='utf-8') as f:
            extracted_text = f.read()

    else:
        raise ValueError(
            "Unsupported file format. Please upload a PDF, DOCX, or TXT file."
        )

    return extracted_text


# ============================================================
# CELERY BACKGROUND TASK — Full Document Processing Pipeline
# ============================================================

@shared_task(name="app.workers.tasks.process_document_pipeline")
def process_document_pipeline(document_id: str):
    """
    Full async pipeline for a single document:
      1. Extract text (with OCR fallback for scanned PDFs)
      2. Run LangGraph AI Brain  (classify → analyze → risk_finder)
      3. Generate & store vector embeddings in Qdrant
      4. Persist results to PostgreSQL
      5. Securely shred the original file from disk (zero-retention)
    """
    from app.agents.graph import lexa_brain
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return f"Document {document_id} not found."

        doc.status = DocStatus.PROCESSING
        db.commit()
        print(f"[Worker] Processing started for: {doc.filename}")
        publish_document_event(
            DocumentEvent.PROCESSING_STARTED,
            document_id=document_id,
            user_email=doc.user_email,
            filename=doc.filename,
            status=DocStatus.PROCESSING.value,
        )
        pipeline_started_at = time.monotonic()

        # ── 1. Extract Text (native + OCR fallback) ──
        extracted_text = extract_text_from_file(doc.s3_path)

        if not extracted_text.strip():
            raise ValueError(
                "No text could be extracted from this document even after OCR. "
                "The file may be corrupted, password-protected, or an unsupported format."
            )

        print(f"[Worker] Total characters extracted: {len(extracted_text)}")

        # ── 2. Run the AI Brain (LangGraph) ──
        print(f"[Worker] Invoking Lexa AI Brain for {doc.filename}...")
        ai_results = lexa_brain.invoke({
            "document_id": document_id,
            "raw_text": extracted_text,
            "doc_type": "",
            "summary": "",
            "extracted_clauses": [],
            "red_flags": [],
            "error": ""
        })

        if ai_results.get("error"):
            raise Exception(ai_results["error"])

        # Persist AI results to PostgreSQL
        doc.summary = ai_results.get("summary")
        doc.extracted_clauses = ai_results.get("extracted_clauses")
        doc.red_flags = ai_results.get("red_flags")

        # ── 3. Generate & Store Vector Embeddings ──
        print(f"[Worker] Vectorizing document for RAG chat...")
        process_and_store_embeddings(document_id, extracted_text)

        # ── 4. Mark as COMPLETED ──
        doc.status = DocStatus.COMPLETED
        db.commit()

        # ── 5. Zero-Retention Security Protocol: Shred original file ──
        if doc.s3_path and os.path.exists(doc.s3_path):
            try:
                os.remove(doc.s3_path)
                print(f"[Security] Original file securely shredded from disk.")
            except Exception as e:
                print(f"[Security Warning] Could not shred file: {str(e)}")

        print(f"[Worker] AI Processing successfully finished for: {doc.filename}")
        publish_document_event(
            DocumentEvent.PROCESSING_COMPLETED,
            document_id=document_id,
            user_email=doc.user_email,
            filename=doc.filename,
            status=DocStatus.COMPLETED.value,
            metadata={
                "duration_seconds": round(time.monotonic() - pipeline_started_at, 2),
                "red_flag_count": len(ai_results.get("red_flags") or []),
                "characters_extracted": len(extracted_text),
            },
        )
        return f"Successfully processed {document_id}"

    except Exception as e:
        db.rollback()
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = DocStatus.FAILED
            db.commit()
        print(f"[Worker] Pipeline crashed: {str(e)}")
        publish_document_event(
            DocumentEvent.PROCESSING_FAILED,
            document_id=document_id,
            user_email=doc.user_email if doc else None,
            filename=doc.filename if doc else None,
            status=DocStatus.FAILED.value,
            metadata={"error": str(e)[:500]},
        )
        return f"Failed processing {document_id}: {str(e)}"

    finally:
        db.close()
