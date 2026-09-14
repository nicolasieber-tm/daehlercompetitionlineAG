import type { ReactNode } from "react";

/** Kleine Eyebrow-Zeile über der Schrittfrage, wie .step-label in der Vorschau. */
export function StepLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
      {children}
    </div>
  );
}

/** Grosse Schrittfrage, wie .q in der Vorschau. */
export function Question({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-balance font-display text-[clamp(28px,4vw,40px)] font-bold uppercase leading-[1.02] tracking-[0.01em]">
      {children}
    </h2>
  );
}

/** Untertitel unter der Frage, wie .sub in der Vorschau. */
export function Subtitle({ children }: { children: ReactNode }) {
  return <p className="mt-2 max-w-[58ch] text-muted">{children}</p>;
}
