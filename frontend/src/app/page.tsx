"use client";

// frontend/src/app/page.tsx
// Dashboard orchestrator. State lives here; presentation lives in components.
//
// Real-time flow: FastAPI/Celery publish lifecycle events to Kafka, the Go
// notifier pushes them here over SSE (useDocumentEvents), and we re-fetch
// authoritative state from the API. No 3-second polling loops.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  uploadDocument,
  getDocuments,
  deleteDocument,
  chatWithDocument,
  getDocumentDetails,
} from "@/lib/api";
import { useDocumentEvents, type DocumentEvent } from "@/hooks/useDocumentEvents";
import type { ChatTurn, DocumentDetails, DocumentMeta } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import AnalysisPane from "@/components/AnalysisPane";
import ChatPane from "@/components/ChatPane";
import PasteZone from "@/components/PasteZone";
import SignInScreen from "@/components/SignInScreen";
import StatusPill from "@/components/StatusPill";

export default function LexaDashboard() {
  const { data: session, status: authStatus } = useSession();

  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selected, setSelected] = useState<DocumentMeta | null>(null);
  const [details, setDetails] = useState<DocumentDetails | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const fetchDocs = useCallback(async (): Promise<DocumentMeta[]> => {
    try {
      const docs: DocumentMeta[] = await getDocuments();
      setDocuments(docs);
      return docs;
    } catch {
      return [];
    }
  }, []);

  const loadDetails = useCallback(async (docId: string) => {
    setIsLoadingDetails(true);
    try {
      setDetails(await getDocumentDetails(docId));
    } catch {
      setDetails(null);
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  // ── Real-time: Kafka → Go notifier → SSE. Event = "something changed". ────
  const handleEvent = useCallback(
    async (evt: DocumentEvent | null) => {
      const docs = await fetchDocs();
      // Keep the selected document's header/status in sync
      setSelected((prev) => {
        if (!prev) return prev;
        const updated = docs.find((d) => d.document_id === prev.document_id);
        return updated ?? null;
      });
      // When the selected doc just finished processing, pull in the analysis
      if (evt?.event_type === "document.processing.completed") {
        setSelected((prev) => {
          if (prev && prev.document_id === evt.document_id) {
            void loadDetails(evt.document_id);
          }
          return prev;
        });
      }
    },
    [fetchDocs, loadDetails],
  );

  const { transport } = useDocumentEvents(handleEvent);

  useEffect(() => {
    if (authStatus === "authenticated") void fetchDocs();
  }, [authStatus, fetchDocs]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadDocument(file);
      await fetchDocs();
    } catch {
      flash("Upload failed — is the backend running?");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePaste = async (text: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    await handleUpload(new File([blob], `Pasted_${Date.now()}.txt`, { type: "text/plain" }));
  };

  const handleDelete = async (docId: string) => {
    try {
      await deleteDocument(docId);
      if (selected?.document_id === docId) {
        setSelected(null);
        setDetails(null);
        setChatHistory([]);
      }
      await fetchDocs();
    } catch {
      flash("Delete failed.");
    }
  };

  const handleSelect = async (doc: DocumentMeta) => {
    setSelected(doc);
    setChatHistory([]);
    setDetails(null);
    if (doc.status === "COMPLETED") void loadDetails(doc.document_id);
  };

  const handleAsk = async (question: string) => {
    if (!selected) return;
    setChatHistory((prev) => [...prev, { role: "user", text: question }]);
    setIsChatting(true);
    try {
      const response = await chatWithDocument(selected.document_id, question);
      setChatHistory((prev) => [...prev, { role: "ai", text: response.answer }]);
    } catch {
      setChatHistory((prev) => [...prev, { role: "ai", text: "Error: could not reach the AI engine." }]);
    } finally {
      setIsChatting(false);
    }
  };

  // ── Auth gates ─────────────────────────────────────────────────────────────
  if (authStatus === "loading") {
    return (
      <div className="h-screen bg-ink flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-[10px] text-fg-faint tracking-[0.2em]">VERIFYING SESSION</p>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return <SignInScreen />;
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-ink text-fg overflow-hidden">
      <Sidebar
        documents={documents}
        selectedId={selected?.document_id ?? null}
        session={session}
        transport={transport}
        isUploading={isUploading}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onUpload={handleUpload}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {notice && (
          <div className="px-5 py-2 bg-danger/10 border-b border-danger/30 text-danger text-[12px] animate-fade-up">
            {notice}
          </div>
        )}

        {selected ? (
          <>
            {/* Command bar */}
            <header className="shrink-0 px-5 py-3 border-b border-hairline flex items-center justify-between gap-4 bg-surface">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="font-mono text-[12px] text-fg-dim truncate">{selected.filename}</h2>
                <StatusPill status={selected.status} />
              </div>
              <span className="font-mono text-[9px] text-fg-faint tracking-widest hidden md:block">
                ID {selected.document_id.slice(0, 8).toUpperCase()}
              </span>
            </header>

            {/* Asymmetric split: audit (wider) · chat */}
            <div className="flex-1 flex min-h-0">
              <section className="w-[58%] border-r border-hairline bg-surface/40 flex flex-col min-h-0">
                <AnalysisPane details={details} isLoading={isLoadingDetails} status={selected.status} />
              </section>
              <section className="flex-1 min-w-0">
                <ChatPane
                  history={chatHistory}
                  isThinking={isChatting}
                  disabled={selected.status !== "COMPLETED"}
                  onAsk={handleAsk}
                />
              </section>
            </div>
          </>
        ) : (
          <PasteZone isUploading={isUploading} onAnalyze={handlePaste} />
        )}
      </main>
    </div>
  );
}
