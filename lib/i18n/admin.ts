// Interne Admin-Texte, ausschliesslich Deutsch (kein Locale-Switch, siehe
// CLAUDE.md: "interne Admin-Texte nur Deutsch in lib/i18n/admin.ts, kein en
// nötig"). Unabhängig von lib/i18n/de.ts / en.ts (keine Dictionary-Struktur).
//
// mail.inbox: Beschriftungen der internen Ticket-Zusammenfassung, wie in
// docs/vorschau.html, Funktion renderIntern().
export const admin = {
  mail: {
    inbox: {
      button: "Im Admin öffnen",
      draftHeading: "Antwortentwurf",
      ticket: {
        request: "ANFRAGE",
        received: "EINGANG",
        customer: "KUNDE",
        contactVia: "KONTAKT VIA",
        existingCustomer: "Bestandskunde",
        newCustomer: "Neukunde",
        vehicle: "FAHRZEUG",
        wish: "GEWÜNSCHT",
        goal: "ZIEL",
        character: "CHARAKTER",
        timing: "TERMIN",
        package: "GESCHÄTZTES PAKET",
        checks: "ZU PRÜFEN",
        customerWrites: "KUNDE SCHREIBT",
        viaWeb: "via daehler.com",
        viaQuick: "via Schnellweg",
        estimate: "Richtpreis",
        // Bewusst ohne Gedankenstrich (siehe CLAUDE.md): definitionList()
        // blendet leere Zeilen ohnehin aus, dieser Fallback greift nur bei
        // Werten, die als Textbaustein (nicht als eigene Zeile) verwendet
        // werden, z.B. "GEWÜNSCHT" ohne Kategorien.
        none: "keine Angabe",
      },
    },
  },
} as const;

export type Admin = typeof admin;
