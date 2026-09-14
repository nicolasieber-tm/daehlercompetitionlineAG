// Kleiner Formatierungs-Helfer, der nur im Admin gebraucht wird
// (Datum+Zeit, z.B. Mail-Protokoll, Follow-up-Zeitpunkte). lib/i18n/format.ts
// formatDate() liefert bewusst nur das Datum (Kundentexte, siehe dort); der
// Admin braucht für Zeitstempel zusätzlich die Uhrzeit.
//
// Mit timeZone: "Europe/Zurich" aus demselben Grund wie formatDate() in
// lib/i18n/format.ts: auf einem Produktions-Host mit TZ=UTC (Railway-
// Standard) würde die Uhrzeit sonst als UTC statt als Schweizer Ortszeit
// angezeigt.
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
