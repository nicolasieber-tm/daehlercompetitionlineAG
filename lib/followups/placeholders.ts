// Platzhalter-Ersetzung für Follow-up-Regeltexte (Posten 6). Siehe
// CLAUDE.md, Abschnitt "Follow-ups (Posten 6)", und docs/architektur.md,
// Tabelle follow_up_rules ("Text mit Platzhaltern {{vorname}}, {{name}},
// {{fahrzeug}}, {{nummer}}").
//
// Getrennt von der Platzhalter-Ersetzung in lib/mail/templates/follow_up.ts
// (dort: fillPlaceholders(), reiner Versandpfad ohne Warnungen): dieses
// Modul liefert zusätzlich die unbekannten Platzhalter zurück, damit der
// Admin sie beim Speichern einer Regel anzeigen kann (siehe Aufgabenstellung
// "unbekannte Platzhalter bleiben stehen und werden als Warnung
// zurückgegeben"). Die beiden Implementierungen bewusst nicht
// zusammengelegt: lib/mail/templates/follow_up.ts gehört nicht zu den für
// diese Aufgabe freigegebenen Dateien.

/** Die vier laut CLAUDE.md/docs/architektur.md unterstützten Platzhalter. */
export const KNOWN_FOLLOW_UP_PLACEHOLDERS = ["vorname", "name", "fahrzeug", "nummer"] as const;

export type KnownFollowUpPlaceholder = (typeof KNOWN_FOLLOW_UP_PLACEHOLDERS)[number];

export interface RenderTemplateResult {
  /** Text mit ersetzten bekannten Platzhaltern; unbekannte bleiben als {{...}} stehen. */
  text: string;
  /**
   * Unbekannte Platzhalter, so wie sie im Text stehen (z.B. "{{modell}}"),
   * ohne Duplikate, in erster Vorkommensreihenfolge. Leer, wenn der Text
   * nur bekannte Platzhalter (oder keine) enthält. Die Formatierung als
   * Hinweistext ist Sache des Admin-UI (nicht Teil dieser Aufgabe), deshalb
   * werden hier bewusst nur die rohen Platzhalter zurückgegeben statt
   * fertiger deutscher Sätze.
   */
  unknownPlaceholders: string[];
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Ersetzt {{vorname}}, {{name}}, {{fahrzeug}}, {{nummer}} im Text durch die
 * übergebenen Werte. Bekannte Platzhalter ohne übergebenen Wert bleiben
 * unverändert stehen (kein Fehler, keine Warnung: sie sind gültig, nur ohne
 * Kontext an dieser Stelle, z.B. beim Prüfen einer Regel im Admin ohne
 * konkrete Anfrage). Unbekannte Platzhalter (jedes {{...}} ausserhalb der
 * vier bekannten Namen) bleiben ebenfalls unverändert stehen, werden aber
 * zusätzlich in `unknownPlaceholders` gemeldet.
 */
export function renderTemplate(
  template: string,
  vars: Partial<Record<KnownFollowUpPlaceholder, string>>,
): RenderTemplateResult {
  const unknown: string[] = [];
  const seen = new Set<string>();

  const text = template.replace(PLACEHOLDER_PATTERN, (match, rawKey: string) => {
    if ((KNOWN_FOLLOW_UP_PLACEHOLDERS as readonly string[]).includes(rawKey)) {
      const key = rawKey as KnownFollowUpPlaceholder;
      const value = vars[key];
      return value !== undefined ? value : match;
    }
    if (!seen.has(match)) {
      seen.add(match);
      unknown.push(match);
    }
    return match;
  });

  return { text, unknownPlaceholders: unknown };
}
