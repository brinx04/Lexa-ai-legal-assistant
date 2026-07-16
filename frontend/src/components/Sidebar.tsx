"use client";

// frontend/src/components/Sidebar.tsx
// Left rail: wordmark, upload dropzone, document registry, session footer.

import { useRef, useState } from "react";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import type { DocumentMeta } from "@/lib/types";
import StatusPill from "./StatusPill";
import { ScaleIcon, UploadIcon, TrashIcon, SignOutIcon } from "./icons";

interface SidebarProps {
  documents: DocumentMeta[];
  selectedId: string | null;
  session: Session | null;
  transport: "connecting" | "live" | "polling";
  isUploading: boolean;
  onSelect: (doc: DocumentMeta) => void;
  onDelete: (docId: string) => void;
  onUpload: (file: File) => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d
      .toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .toUpperCase();
  } catch {
    return "—";
  }
}

const TRANSPORT_BADGE = {
  live: { label: "LIVE", dot: "bg-ok", text: "text-ok", title: "Real-time: Kafka → SSE stream connected" },
  polling: { label: "POLL", dot: "bg-warn", text: "text-warn", title: "Degraded: notifier unreachable, polling every 10s" },
  connecting: { label: "SYNC", dot: "bg-fg-faint", text: "text-fg-faint", title: "Connecting to event stream…" },
} as const;

export default function Sidebar({
  documents,
  selectedId,
  session,
  transport,
  isUploading,
  onSelect,
  onDelete,
  onUpload,
}: SidebarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const badge = TRANSPORT_BADGE[transport];

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) onUpload(files[0]);
  };

  return (
    <aside className="w-72 shrink-0 bg-surface border-r border-hairline flex flex-col">
      {/* Wordmark */}
      <div className="px-5 pt-5 pb-4 border-b border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-raised border border-hairline-bright flex items-center justify-center text-accent-bright">
              <ScaleIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-[15px] tracking-tight leading-none">
                lexa<span className="text-accent animate-blink">_</span>
              </h1>
              <p className="font-mono text-[9px] text-fg-faint tracking-[0.2em] mt-1">LEGAL INTELLIGENCE</p>
            </div>
          </div>
          <span
            title={badge.title}
            className={`inline-flex items-center gap-1.5 font-mono text-[9px] tracking-widest ${badge.text} border border-hairline rounded-full px-2 py-1`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} ${transport !== "connecting" ? "animate-pulse-dot" : ""}`} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Upload dropzone */}
      <div className="p-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          disabled={isUploading}
          className={`group w-full rounded-lg border border-dashed p-4 text-left transition-all duration-200
            ${dragOver
              ? "border-accent bg-accent/5 glow-accent"
              : "border-hairline-bright hover:border-accent/60 hover:bg-raised"}
            disabled:opacity-50 disabled:cursor-wait`}
        >
          <div className="flex items-center gap-3">
            <span className={`text-fg-faint transition-colors duration-200 group-hover:text-accent-bright ${isUploading ? "animate-pulse" : ""}`}>
              <UploadIcon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-fg-dim group-hover:text-fg transition-colors">
                {isUploading ? "Ingesting…" : "Drop a contract"}
              </p>
              <p className="font-mono text-[9px] text-fg-faint tracking-wider mt-0.5">PDF · DOCX · TXT</p>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </button>
      </div>

      {/* Registry */}
      <div className="px-5 pb-2 flex items-baseline justify-between">
        <span className="font-mono text-[9px] text-fg-faint tracking-[0.2em]">REGISTRY</span>
        <span className="font-mono text-[9px] text-fg-faint">
          {String(documents.length).padStart(2, "0")} DOCS
        </span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-1">
        {documents.length === 0 && (
          <p className="px-2 py-6 text-center font-mono text-[10px] text-fg-faint tracking-wider">
            NO DOCUMENTS YET
          </p>
        )}
        {documents.map((doc) => {
          const active = selectedId === doc.document_id;
          return (
            <div
              key={doc.document_id}
              onClick={() => onSelect(doc)}
              className={`group relative rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150
                ${active
                  ? "bg-raised border-accent/50"
                  : "border-transparent hover:border-hairline-bright hover:bg-raised/60"}`}
            >
              {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-px bg-accent" />}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-[13px] truncate transition-colors ${active ? "text-fg" : "text-fg-dim group-hover:text-fg"}`}>
                    {doc.filename}
                  </p>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <StatusPill status={doc.status} />
                    <span className="font-mono text-[9px] text-fg-faint">{formatDate(doc.created_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc.document_id); }}
                  title="Delete document"
                  className="shrink-0 p-1 rounded text-fg-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all duration-150"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Session footer */}
      <div className="border-t border-hairline px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-7 h-7 rounded-full border border-hairline-bright" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-raised border border-hairline-bright flex items-center justify-center font-mono text-[10px] text-accent-bright">
              {session?.user?.email?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[12px] text-fg-dim truncate">{session?.user?.name ?? "Signed in"}</p>
            <p className="font-mono text-[9px] text-fg-faint truncate">{session?.user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          title="Sign out"
          className="p-1.5 rounded text-fg-faint hover:text-danger hover:bg-danger/10 transition-colors duration-150"
        >
          <SignOutIcon className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
