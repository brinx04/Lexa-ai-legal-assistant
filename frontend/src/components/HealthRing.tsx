// frontend/src/components/HealthRing.tsx
// SVG ring gauge for the contract health score — no chart library.

interface HealthRingProps {
  score: number; // 0–100
}

export default function HealthRing({ score }: HealthRingProps) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const tone = score >= 80 ? "var(--color-ok)" : score >= 55 ? "var(--color-warn)" : "var(--color-danger)";

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="4" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-sm font-semibold" style={{ color: tone }}>
          {score}
        </span>
      </div>
    </div>
  );
}
