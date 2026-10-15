// Vorher/Nachher-Leistungszahlen für die "Leistung"-Zeile, wie beforeAfter()
// in docs/vorschau.html («<b>530</b> PS · 650 Nm» → «<b>640</b> PS · 750
// Nm»). Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
// Punkt 3): vorher = Serienleistung des gewählten Modells, nachher =
// ps_to/nm_to der gewählten Leistungsstufe, dazu ein grünes Plus. Reine
// Rechen-/Textfunktionen (kein React, kein DB-/Netzwerkzugriff) - werden
// sowohl von components/flow/beforeAfter.ts (Abschluss-Screen, Teilen-
// Seite, jeweils über components/ui/BeforeAfter.tsx grosse Zahlen-
// Darstellung) als auch direkt von lib/mail/templates/confirmation.ts und
// summary.ts (Klartext-Zeile "460 PS → 620 PS / 740 Nm (+160 PS)")
// verwendet.

/** Vorher/Nachher-Leistungszahlen samt Differenz, nur gebildet, wenn beide PS-Werte bekannt sind (siehe buildPowerBeforeAfter()). */
// Rückmeldung dÄHLer 15.10.2026: das Drehmoment erscheint nur als
// Zielwert der Stufe (aus der Excel, «620 PS / 740 Nm»), nie als Serienwert
// oder Zuwachs. Die Excel nennt kein Serien-Drehmoment, eine Pflege im Admin
// für über 100 Motorisierungen ist nicht gewünscht.
export interface PowerBeforeAfter {
  beforePs: number;
  afterPs: number;
  afterNm: number | null;
  diffPs: number;
}

/**
 * Baut die Vorher/Nachher-Leistungszahlen. null, wenn die Serienleistung
 * (vorher) oder die Zielleistung der gewählten Stufe (nachher) nicht
 * bekannt ist - dann bleibt die bisherige Text-Darstellung (Serie/Beratung/
 * Produktnamen, siehe components/flow/beforeAfter.ts) unverändert, ohne
 * grosse Zahlen/Plus.
 */
export function buildPowerBeforeAfter(
  seriesPs: number | null | undefined,
  stagePsTo: number | null | undefined,
  stageNmTo: number | null | undefined,
): PowerBeforeAfter | null {
  if (seriesPs == null || stagePsTo == null) return null;
  return {
    beforePs: seriesPs,
    afterPs: stagePsTo,
    afterNm: stageNmTo ?? null,
    diffPs: stagePsTo - seriesPs,
  };
}

/** "460 PS". */
export function formatPowerBeforeText(power: PowerBeforeAfter): string {
  return `${power.beforePs} PS`;
}

/** "620 PS" oder, wenn bekannt, "620 PS / 740 Nm". */
export function formatPowerAfterText(power: PowerBeforeAfter): string {
  return power.afterNm != null ? `${power.afterPs} PS / ${power.afterNm} Nm` : `${power.afterPs} PS`;
}

/** "+160 PS". */
export function formatPowerPlusText(power: PowerBeforeAfter): string {
  return `+${power.diffPs} PS`;
}

/** Klartext-Zeile für Mails: "460 PS → 620 PS / 740 Nm (+160 PS)". */
export function formatPowerLine(power: PowerBeforeAfter): string {
  return `${formatPowerBeforeText(power)} → ${formatPowerAfterText(power)} (${formatPowerPlusText(power)})`;
}
