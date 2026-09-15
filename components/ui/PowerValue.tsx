// Grosse Zahlen-Darstellung für die "Leistung"-Zeile der Vorher/Nachher-
// Tabelle (components/ui/BeforeAfter.tsx), wie .stat b / .delta .n in
// docs/vorschau.html: Zahl gross und fett in der Display-Schrift, Einheit
// klein, dazu ein grünes Plus auf der Nachher-Seite. Rückmeldung zweiter
// Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3). Reine Präsentations-
// Komponente ohne Hooks/State - lässt sich unverändert sowohl aus
// components/flow/steps/DoneStep.tsx (Client) als auch aus
// app/p/[token]/page.tsx (Server Component) verwenden.
import type { PowerBeforeAfter } from "@/lib/catalog/power-before-after";
import { formatPowerPlusText } from "@/lib/catalog/power-before-after";

/** "Vorher"-Seite: Serienleistung, ohne Plus. */
export function PowerBeforeValue({ power }: { power: PowerBeforeAfter }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5">
      <b className="font-display text-2xl font-bold leading-none tabular-nums text-dim">{power.beforePs}</b>
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-dim">
        PS{power.beforeNm != null ? ` · ${power.beforeNm} Nm` : ""}
      </span>
    </span>
  );
}

/** "Nachher"-Seite: Zielleistung der gewählten Stufe, plus grünes "+160 PS". */
export function PowerAfterValue({ power }: { power: PowerBeforeAfter }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="inline-flex flex-wrap items-baseline gap-1.5">
        <b className="font-display text-2xl font-bold leading-none tabular-nums text-text">{power.afterPs}</b>
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          PS{power.afterNm != null ? ` · ${power.afterNm} Nm` : ""}
        </span>
      </span>
      <span className="font-mono text-[13px] text-ok">{formatPowerPlusText(power)}</span>
    </span>
  );
}
