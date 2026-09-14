// Settings-Schlüssel (Aufgabenstellung: "Formular für alle settings-
// Schlüssel"), siehe docs/architektur.md, Abschnitt "Datenmodell",
// `settings`. Eigenes, reines Datenmodul statt in app/admin/actions/
// settings.ts definiert: eine "use server"-Datei darf ausschliesslich
// async Funktionen exportieren (Next.js wandelt jeden Export sonst in
// einen Server-Action-Verweis um) - ein einfacher Array-Export wie dieser
// kommt als Client-Import daraus nicht nutzbar an (führte zu "SETTINGS_
// KEYS.map is not a function" im Browser, siehe Bericht). components/admin/
// SettingsForm.tsx (Client) und app/admin/actions/settings.ts (Server
// Action) importieren beide von hier.
export const SETTINGS_KEYS = [
  "mail_from_name",
  "mail_from",
  "mail_inbox",
  "mail_bcc",
  "mail_reply_to",
  "signature_name",
  "signature_phone",
  "company_address",
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];
