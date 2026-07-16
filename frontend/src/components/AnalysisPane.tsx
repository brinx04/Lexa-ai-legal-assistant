"use client";

// frontend/src/components/AnalysisPane.tsx
// The audit report: health gauge, executive summary, red-flag accordion.

import { useState } from "react";
import type { DocumentDetails, RedFlag } from "@/lib/types";
import HealthRing from "./HealthRing";
import { AlertIcon, SparkIcon } from "./icons";

const SEVERITY_STYLE: Record<string, { chip: string; bar: string }> = {
  CRITICAL: { chip: "bg-danger/15 text-danger border-danger/40", bar: "bg-danger" },
  HIGH: { chip: "bg-warn/15 text-warn border-warn/40", bar: "bg-warn" },
  MODERATE: { chip: "bg-accent/15 text-accent-bright border-accent/40", bar: "bg-accent" },
};

function severityOf(flag: RedFlag) {
  const s = (flag.severity ?? "MODERATE").toUpperCase();
  return SEVERITY_STYLE[s] ?? SEVERITY_STYLE.MODERATE;
}

interface AnalysisPaneProps {
  details: DocumentDetails | null;
  isLoading: boolean;
  status: string;
}

export default function AnalysisPane({ details, isLoading, status }: AnalysisPaneProps) {
  const [expanded, setExpanded] = useState<number | null>(0);

  const flags = details?.red_flags ?? [];
  const score = Math.max(100 - flags.length * 15, 30);

  if (status !== "COMPLETED") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-raised border border-hairline-bright flex items-center justify-center text-accent-bright">
            <SparkIcon className="w-5 h-5" />
          </div>
          {status !== "FAILED" && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent animate-pulse-dot" />
          )}
        </div>
        {status === "FAILED" ? (
          <div>
            <p className="text-[14px] text-danger">Analysis failed</p>
            <p className="font-mono text-[10px] text-fg-faint tracking-wider mt-1.5">
              CHECK WORKER LOGS · RE-UPLOAD TO RETRY
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[14px] text-fg-dim">Agents are reading your document</p>
            <p className="font-mono text-[10px] text-fg-faint tracking-wider mt-1.5">
              CLASSIFY → ANALYZE → RISK SCAN → EMBED
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        {[64, 160, 96].map((h, i) => (
          <div key={i} className="rounded-xl bg-raised/60 border border-hairline animate-pulse" style={{ height: h }} />
        ))}
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="p-6 space-y-6 animate-fade-up">
        {/* Verdict strip */}
        <div className="rounded-xl bg-raised border border-hairline p-5 flex items-center gap-5">
          <HealthRing score={score} />
          <div className="min-w-0">
            <p className="font-mono text-[9px] text-fg-faint tracking-[0.2em] mb-1">CONTRACT HEALTH</p>
            <p className="font-display text-[15px] font-medium leading-snug">
              {flags.length === 0
                ? "No red flags detected"
                : `${flags.length} issue${flags.length > 1 ? "s" : ""} require${flags.length === 1 ? "s" : ""} review`}
            </p>
            <p className="text-[12px] text-fg-dim mt-0.5">
              {score >= 80 ? "Low-risk document." : score >= 55 ? "Negotiate the flagged clauses before signing." : "High-risk — seek counsel before signing."}
            </p>
          </div>
        </div>

        {/* Executive summary */}
        {details.summary && (
          <section>
            <h3 className="font-mono text-[9px] text-fg-faint tracking-[0.2em] mb-2.5 flex items-center gap-2">
              <SparkIcon className="w-3 h-3 text-accent-bright" />
              EXECUTIVE SUMMARY
            </h3>
            <div className="rounded-xl bg-raised border border-hairline p-5">
              <p className="text-[13px] leading-relaxed text-fg-dim">{details.summary}</p>
            </div>
          </section>
        )}

        {/* Red flags */}
        {flags.length > 0 && (
          <section>
            <h3 className="font-mono text-[9px] text-fg-faint tracking-[0.2em] mb-2.5 flex items-center gap-2">
              <AlertIcon className="w-3 h-3 text-danger" />
              RED FLAGS · {String(flags.length).padStart(2, "0")}
            </h3>
            <div className="space-y-2">
              {flags.map((flag, idx) => {
                const open = expanded === idx;
                const tone = severityOf(flag);
                return (
                  <div
                    key={idx}
                    className={`relative rounded-xl border overflow-hidden transition-colors duration-200
                      ${open ? "bg-raised border-hairline-bright" : "bg-transparent border-hairline hover:border-hairline-bright"}`}
                  >
                    <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone.bar} ${open ? "opacity-100" : "opacity-40"}`} />
                    <button
                      onClick={() => setExpanded(open ? null : idx)}
                      className="w-full pl-5 pr-4 py-3.5 flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 font-mono text-[9px] tracking-widest border rounded px-1.5 py-0.5 ${tone.chip}`}>
                          {(flag.severity ?? "MODERATE").toUpperCase()}
                        </span>
                        <span className="text-[13px] font-medium truncate">
                          {flag.issue ?? "Unspecified liability"}
                        </span>
                      </div>
                      <span className={`font-mono text-[10px] text-fg-faint transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
                        ›
                      </span>
                    </button>

                    {open && (
                      <div className="pl-5 pr-4 pb-4 space-y-3 animate-fade-up">
                        <p className="text-[13px] leading-relaxed text-fg-dim">
                          {flag.reasoning ?? flag.explanation ?? flag.description ?? "No contextual reasoning supplied by the agent."}
                        </p>
                        {flag.clause_reference && (
                          <div className="rounded-lg bg-ink border border-hairline p-3">
                            <p className="font-mono text-[9px] text-fg-faint tracking-[0.2em] mb-1.5">EVIDENCE</p>
                            <p className="font-mono text-[11px] leading-relaxed text-fg-dim">
                              “{flag.clause_reference}”
                            </p>
                          </div>
                        )}
                        {flag.kanoon_citation && (
                          <a
                            href={flag.kanoon_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg bg-ink border border-hairline hover:border-accent/50 p-3 transition-colors duration-150 group"
                          >
                            <p className="font-mono text-[9px] text-fg-faint tracking-[0.2em] mb-1.5 group-hover:text-accent-bright transition-colors">
                              CASE LAW · INDIAN KANOON ↗
                            </p>
                            <p className="font-mono text-[11px] text-fg-dim truncate">
                              {flag.kanoon_citation.replace(/<[^>]+>/g, "")}
                            </p>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
