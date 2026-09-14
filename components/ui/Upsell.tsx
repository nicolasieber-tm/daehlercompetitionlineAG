import type { ReactNode } from "react";
import { Button } from "./Button";

export type UpsellProps = {
  title: ReactNode;
  text: ReactNode;
  /** true, wenn die Kategorie bereits als nächster Schritt eingefügt wurde. */
  added?: boolean;
  ctaLabel: string;
  onCta: () => void;
};

/** «Passt gut dazu»-Box wie .upsell in der Vorschau: gestrichelter Rahmen, wird bei Übernahme durchgezogen/grün. */
export function Upsell({ title, text, added = false, ctaLabel, onCta }: UpsellProps) {
  return (
    <div
      className={[
        "mt-5 flex flex-wrap items-center justify-between gap-4 border bg-panel px-4 py-3.5",
        added ? "border-solid border-ok" : "border-dashed border-line-alt",
      ].join(" ")}
    >
      <div className="flex flex-col gap-0.5">
        <b className="font-display text-[17px] font-semibold uppercase tracking-[0.06em]">{title}</b>
        <span className="text-[13px] text-muted">{text}</span>
      </div>
      <Button variant={added ? "ghost" : "line"} size="sm" onClick={onCta}>
        {ctaLabel}
      </Button>
    </div>
  );
}
