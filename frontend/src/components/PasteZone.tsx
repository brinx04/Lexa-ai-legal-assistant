"use client";

// frontend/src/components/PasteZone.tsx
// Empty state — paste raw contract text for instant analysis.

import { useState } from "react";

interface PasteZoneProps {
  isUploading: boolean;
  onAnalyze: (text: string) => void;
}

export default function PasteZone({ isUploading, onAnalyze }: PasteZoneProps) {
  const [text, setText] = useState("");
  const charCount = text.trim().length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!charCount || isUploading) return;
    onAnalyze(text);
    setText("");
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden">
      {/* Ambient accent glow behind the composer */}
      <div
        className="absolute w-[520px] h-[320px] rounded-full pointer-events-none opacity-[0.07]"
        style={{ background: "radial-gradient(closest-side, var(--color-accent), transparent)" }}
      />

      <div className="relative w-full max-w-2xl animate-fade-up">
        <p className="font-mono text-[10px] text-fg-faint tracking-[0.25em] mb-3">NEW ANALYSIS</p>
        <h2 className="font-display text-3xl font-semibold tracking-tight leading-tight">
          Read the fine print,
          <br />
          <span className="text-fg-dim">before it reads you.</span>
        </h2>
        <p className="text-[13px] text-fg-dim mt-3 max-w-md">
          Drop a file in the sidebar, or paste any contract, NDA, or agreement below.
          Lexa's agents will summarize it, flag risky clauses, and ground them in Indian case law.
        </p>

        <form onSubmit={submit} className="mt-8">
          <div className="rounded-xl bg-surface border border-hairline focus-within:border-accent/50 focus-within:glow-accent transition-all duration-300">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full text of your agreement here…"
              className="w-full h-56 bg-transparent p-5 text-[13px] leading-relaxed placeholder:text-fg-faint focus:outline-none resize-none custom-scrollbar"
            />
            <div className="flex items-center justify-between px-4 py-3 border-t border-hairline">
              <span className="font-mono text-[10px] text-fg-faint tracking-wider">
                {charCount.toLocaleString()} CHARS
              </span>
              <button
                type="submit"
                disabled={isUploading || !charCount}
                className="rounded-lg bg-accent hover:bg-accent-bright text-white text-[13px] font-medium px-5 py-2
                  active:scale-[0.98] transition-all duration-150
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-accent"
              >
                {isUploading ? "Analyzing…" : "Run analysis"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
