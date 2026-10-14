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

/**
 * Auffällige Teilfrage innerhalb eines Schritts (z.B. «Welche Version fahren
 * Sie?» unter den Baureihen-Kacheln, «Produkte auswählen» im Kategorie-
 * Schritt). Rückmeldung dÄHLer 14.10.2026: die bisherigen kleinen roten
 * Eyebrow-Zeilen gingen neben Kacheln und Chips unter, Kunden haben die
 * Auswahl (z.B. M2 oder M2 CS) übersehen. `hint` steht direkt darunter,
 * mit `missing` in Warnfarbe (Pflichtangabe noch offen).
 */
export function ChoiceLabel({
  children,
  hint,
  missing = false,
}: {
  children: ReactNode;
  hint?: ReactNode;
  missing?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5 font-display text-[18px] font-semibold uppercase leading-tight tracking-[0.05em] text-text">
        <span aria-hidden className="h-[1.1em] w-1 shrink-0 bg-red-bright" />
        {children}
      </div>
      {hint ? (
        <p className={["mt-1 pl-3.5 text-[13px]", missing ? "text-warn" : "text-muted"].join(" ")} aria-live="polite">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
