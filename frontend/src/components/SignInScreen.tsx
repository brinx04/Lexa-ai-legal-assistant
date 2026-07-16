"use client";

// frontend/src/components/SignInScreen.tsx
// Shared auth screen — used by the root auth gate and /auth/signin.

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GoogleIcon, ScaleIcon } from "./icons";

export default function SignInScreen() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute w-[640px] h-[400px] rounded-full pointer-events-none opacity-[0.08]"
        style={{ background: "radial-gradient(closest-side, var(--color-accent), transparent)" }}
      />

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="rounded-2xl bg-surface border border-hairline p-8">
          <div className="w-11 h-11 rounded-xl bg-raised border border-hairline-bright flex items-center justify-center text-accent-bright mb-6">
            <ScaleIcon className="w-5 h-5" />
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight">
            lexa<span className="text-accent animate-blink">_</span>
          </h1>
          <p className="text-[13px] text-fg-dim mt-1.5 leading-relaxed">
            AI contract review with red-flag detection and Indian case-law grounding.
          </p>

          <div className="divider-glow my-7" />

          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="group w-full flex items-center justify-center gap-3 rounded-lg bg-raised border border-hairline-bright
              hover:border-accent/60 hover:bg-overlay px-4 py-3 text-[13px] font-medium
              active:scale-[0.99] transition-all duration-150 disabled:opacity-60 disabled:cursor-wait"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-fg-faint border-t-fg rounded-full animate-spin" />
            ) : (
              <GoogleIcon className="w-4 h-4" />
            )}
            {isLoading ? "Signing in…" : "Continue with Google"}
          </button>

          <p className="font-mono text-[9px] text-fg-faint tracking-wider leading-relaxed mt-6">
            DOCUMENTS ARE ISOLATED PER ACCOUNT.
            <br />
            ORIGINALS ARE SHREDDED AFTER ANALYSIS.
          </p>
        </div>

        <p className="text-center font-mono text-[9px] text-fg-faint tracking-[0.2em] mt-6">
          LEXA · LEGAL INTELLIGENCE · 2026
        </p>
      </div>
    </div>
  );
}
