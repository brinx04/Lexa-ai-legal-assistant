// frontend/src/components/StatusPill.tsx
// Mono status chip with a live dot — PENDING / PROCESSING pulse, terminal
// states are steady.

import type { DocStatus } from "@/lib/types";

const STYLES: Record<DocStatus, { dot: string; text: string; label: string; pulse: boolean }> = {
  PENDING: { dot: "bg-warn", text: "text-warn", label: "QUEUED", pulse: true },
  PROCESSING: { dot: "bg-accent-bright", text: "text-accent-bright", label: "ANALYZING", pulse: true },
  COMPLETED: { dot: "bg-ok", text: "text-ok", label: "READY", pulse: false },
  FAILED: { dot: "bg-danger", text: "text-danger", label: "FAILED", pulse: false },
};

export default function StatusPill({ status }: { status: DocStatus }) {
  const s = STYLES[status] ?? STYLES.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse ? "animate-pulse-dot" : ""}`} />
      {s.label}
    </span>
  );
}
