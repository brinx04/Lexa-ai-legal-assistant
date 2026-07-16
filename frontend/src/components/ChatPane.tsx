"use client";

// frontend/src/components/ChatPane.tsx
// RAG chat over the selected document.

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/lib/types";
import { ChatIcon, SendIcon } from "./icons";

interface ChatPaneProps {
  history: ChatTurn[];
  isThinking: boolean;
  disabled: boolean;
  onAsk: (question: string) => void;
}

export default function ChatPane({ history, isThinking, disabled, onAsk }: ChatPaneProps) {
  const [question, setQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isThinking]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || disabled || isThinking) return;
    setQuestion("");
    onAsk(q);
  };

  return (
    <div className="flex flex-col h-full bg-ink">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-raised border border-hairline-bright flex items-center justify-center text-fg-faint">
              <ChatIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-[13px] text-fg-dim">Interrogate the document</p>
              <p className="font-mono text-[9px] text-fg-faint tracking-wider mt-1">
                “WHAT HAPPENS IF I TERMINATE EARLY?”
              </p>
            </div>
          </div>
        ) : (
          history.map((turn, idx) => (
            <div key={idx} className={`flex animate-fade-up ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap
                  ${turn.role === "user"
                    ? "bg-accent/15 border border-accent/30 text-fg"
                    : "bg-raised border border-hairline text-fg-dim"}`}
              >
                {turn.text}
              </div>
            </div>
          ))
        )}
        {isThinking && (
          <div className="flex justify-start animate-fade-up">
            <div className="rounded-xl bg-raised border border-hairline px-4 py-3 flex items-center gap-2.5">
              <span className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1 h-1 rounded-full bg-accent-bright animate-pulse-dot"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
              <span className="font-mono text-[10px] text-fg-faint tracking-wider">SEARCHING CLAUSES</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-hairline">
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-xl bg-surface border border-hairline focus-within:border-accent/60 focus-within:glow-accent transition-all duration-200 p-1.5"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={disabled ? "Available once analysis completes…" : "Ask about this document…"}
            disabled={disabled || isThinking}
            className="flex-1 bg-transparent px-3 py-2 text-[13px] placeholder:text-fg-faint focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={disabled || isThinking || !question.trim()}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-accent text-white
              hover:bg-accent-bright active:scale-95 transition-all duration-150
              disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
