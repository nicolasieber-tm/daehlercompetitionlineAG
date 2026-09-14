import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

/** Runder Auswahl-Chip wie .chip in der Vorschau (Zeitraum, Kanal, Folgefragen). */
export function Chip({ active = false, className = "", children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      {...props}
      aria-pressed={active}
      className={[
        // min-h-11 (44px) statt der reinen Padding-Höhe (~36px): Touch-Ziel
        // mindestens 44px, ohne die sichtbare Pill-Optik aus der Vorschau
        // zu verändern (Inhalt bleibt vertikal zentriert, nur die
        // klickbare Fläche wächst) - Prüfung, Minor-Befund "Touch-Ziele".
        "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2",
        "font-display text-[15px] font-semibold uppercase tracking-[0.06em]",
        "transition-colors duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
        active
          ? "border-red bg-red text-white"
          : "border-line-alt bg-transparent text-muted hover:border-muted hover:text-text",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
