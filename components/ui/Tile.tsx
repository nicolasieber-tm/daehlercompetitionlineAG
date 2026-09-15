import type { ButtonHTMLAttributes, ReactNode } from "react";

export type TileProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: ReactNode;
  /** Preisnahe Nebenzeile in Mono, z.B. "620 PS / 740 Nm" bei einer
   * Motor-Leistungsstufe (lib/catalog/product-display.ts productDisplay()).
   * Rückmeldung erster Klicktest, CLAUDE.md Abschnitt "AUFGABE", Punkt 1. */
  subtitle?: ReactNode;
  description?: ReactNode;
  /** Preiszeile, z.B. "ab CHF 4'180", "in Vorbereitung", "auf Anfrage". */
  price?: ReactNode;
  /** true, wenn kein Preis vorhanden ist (gedimmte Darstellung wie .p.na). */
  priceMuted?: boolean;
  badge?: ReactNode;
  selected?: boolean;
  /** Bild-URL für die Foto-Kachel-Variante (Fahrzeug, Kategorie, Charakter). */
  imageUrl?: string;
  /** Grössere, hohe Kachel (Charakter-Optionen). */
  tall?: boolean;
};

/**
 * Auswahl-Kachel wie .tile in der Vorschau. Ohne imageUrl: einfache
 * Produktkachel mit Titel/Beschreibung/Preis. Mit imageUrl: Foto-Kachel mit
 * Verlaufsschatten (Fahrzeug, Kategorie, Charakter).
 */
export function Tile({
  title,
  subtitle,
  description,
  price,
  priceMuted = false,
  badge,
  selected = false,
  imageUrl,
  tall = false,
  className = "",
  style,
  ...props
}: TileProps) {
  if (imageUrl) {
    return (
      <button
        type="button"
        {...props}
        aria-pressed={selected}
        style={{ backgroundImage: `url(${imageUrl})`, ...style }}
        className={[
          "relative flex flex-col justify-end overflow-hidden rounded-[2px] border bg-cover bg-center text-left",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
          tall ? "min-h-[190px]" : "min-h-[150px]",
          selected ? "border-red-bright shadow-[inset_0_0_0_1px_var(--color-red-bright)]" : "border-line-alt",
          className,
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute inset-0 bg-linear-to-b",
            selected
              ? "from-red-soft via-bg/50 to-bg/90"
              : "from-bg/15 via-bg/55 to-bg/90",
          ].join(" ")}
        />
        <span className="relative z-[1] flex min-w-0 flex-col gap-1 px-3.5 pb-3 pt-2">
          <span className="font-display text-xl font-semibold uppercase leading-none tracking-[0.02em] break-words [overflow-wrap:anywhere] sm:text-2xl">
            {title}
          </span>
          {description ? (
            <span className="break-words [overflow-wrap:anywhere] text-[13px] leading-snug text-text-soft">
              {description}
            </span>
          ) : null}
          {badge ? (
            <span className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ok">
              {badge}
            </span>
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      {...props}
      aria-pressed={selected}
      style={style}
      className={[
        "relative flex min-h-[74px] min-w-0 flex-col gap-1 rounded-[2px] border px-3.5 pb-3 pt-3.5 text-left transition-colors duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
        selected ? "border-red-bright bg-red-soft" : "border-line bg-panel hover:border-line-alt hover:bg-panel-alt",
        className,
      ].join(" ")}
    >
      {selected ? (
        <span
          aria-hidden
          className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-bright shadow-[0_0_0_3px_var(--color-red-soft)]"
        />
      ) : null}
      <span className="break-words [overflow-wrap:anywhere] pr-4 font-display text-xl font-semibold uppercase leading-none tracking-[0.02em]">
        {title}
      </span>
      {subtitle ? (
        <span className="break-words [overflow-wrap:anywhere] font-mono text-[13px] tabular-nums text-text-soft">
          {subtitle}
        </span>
      ) : null}
      {description ? (
        <span className="break-words [overflow-wrap:anywhere] text-[13px] leading-snug text-muted">
          {description}
        </span>
      ) : null}
      {price ? (
        <span className={["mt-auto pt-1.5 font-mono text-xs tabular-nums", priceMuted ? "text-dim" : "text-text"].join(" ")}>
          {price}
        </span>
      ) : null}
      {badge ? (
        <span className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ok">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
