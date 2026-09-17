// Interne Admin-Texte, ausschliesslich Deutsch (kein Locale-Switch, siehe
// CLAUDE.md: "interne Admin-Texte nur Deutsch in lib/i18n/admin.ts, kein en
// nötig"). Unabhängig von lib/i18n/de.ts / en.ts (keine Dictionary-Struktur).
//
// mail.inbox: Beschriftungen der internen Ticket-Zusammenfassung, wie in
// docs/vorschau.html, Funktion renderIntern().
export const admin = {
  nav: {
    brand: "dÄHLer",
    brandSub: "Competition Line · Admin",
    inquiries: "Anfragen",
    pricelists: "Preislisten",
    models: "Modelle",
    followups: "Follow-ups",
    quick: "Schnellweg",
    settings: "Einstellungen",
    logout: "Abmelden",
    loggedInAs: "Angemeldet als",
    menuOpen: "Menü öffnen",
    menuClose: "Menü schliessen",
  },
  login: {
    title: "Admin-Anmeldung",
    subtitle: "dÄHLer Competition Line AG",
    email: "E-Mail",
    password: "Passwort",
    submit: "Anmelden",
    submitPending: "Meldet an …",
    errorInvalid: "E-Mail oder Passwort ist falsch.",
    errorGeneric: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  },
  status: {
    neu: "Neu",
    in_bearbeitung: "In Bearbeitung",
    beantwortet: "Beantwortet",
    abgeschlossen: "Abgeschlossen",
  } as const,
  source: {
    web: "Web",
    quick: "Schnellweg",
  } as const,
  priceStatus: {
    priced: "Preis",
    in_preparation: "In Vorbereitung",
    on_request: "Auf Anfrage",
  } as const,
  // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
  // Getriebe-Label für die Fahrzeug-Karte (components/admin/VehicleCard.tsx)
  // und das Ticket (lib/inquiry/summary.ts). "" (Modellauswahl-Wert null)
  // wird von den Aufrufern selbst gefiltert (admin.common.none), nicht hier.
  gearbox: {
    manual: "Handschalter",
    automatic: "Automat",
    unknown: "unbekannt",
  } as const,
  emailType: {
    confirmation: "Bestätigung",
    inbox: "Anfrage-Mail",
    summary: "Zusammenfassung",
    reply: "Antwort",
    follow_up: "Follow-up",
  } as const,
  emailStatus: {
    sent: "Gesendet",
    failed: "Fehlgeschlagen",
  } as const,
  common: {
    yes: "Ja",
    no: "Nein",
    cancel: "Abbrechen",
    save: "Speichern",
    saved: "Gespeichert.",
    loading: "Lädt …",
    error: "Fehler",
    none: "keine Angabe",
    backToOverview: "Zur Übersicht",
    open: "Öffnen",
  },
  list: {
    title: "Anfragen",
    subtitle: "Alle eingegangenen Anfragen, neueste zuerst.",
    columns: {
      number: "Nummer",
      date: "Datum",
      customer: "Kunde",
      vehicle: "Fahrzeug",
      wish: "Wunsch",
      price: "Richtpreis",
      status: "Status",
      source: "Quelle",
    },
    filters: {
      statusAll: "Alle Status",
      family: "Baureihe",
      familyAll: "Alle Baureihen",
      dateFrom: "Von",
      dateTo: "Bis",
      search: "Suche",
      searchPlaceholder: "Nummer, Name, E-Mail, Ort",
      submit: "Filtern",
      reset: "Zurücksetzen",
    },
    empty: "Keine Anfragen gefunden.",
    onRequest: "auf Anfrage",
    pagination: {
      prev: "Zurück",
      next: "Weiter",
      pageOf: "Seite {page} von {total}",
      total: "{count} Anfragen",
    },
  },
  detail: {
    title: "Anfrage {number}",
    backToOverview: "Zur Übersicht",
    statusLabel: "Status",
    statusSaved: "Status gespeichert.",
    markAnswerReceived: "Antwort erhalten",
    markAnswerReceivedDone: "Antwort erhalten am {date}",
    complete: "Abschliessen",
    completeDone: "Abgeschlossen",
    repliedAt: "Beantwortet am {date}",
    summary: {
      title: "Zusammenfassung",
      copy: "Kopieren",
      copied: "Kopiert.",
    },
    customer: {
      title: "Kunde",
      name: "Name",
      city: "Ort",
      phone: "Telefon",
      email: "E-Mail",
      channel: "Bevorzugter Kanal",
      relationship: "Beziehung",
      newCustomer: "Neukunde",
      existingCustomer: "Bestandskunde",
    },
    vehicle: {
      title: "Fahrzeug",
      year: "Baujahr",
      series: "Serie",
      // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt
      // 3): eigene Zeile in components/admin/VehicleCard.tsx, nur wenn die
      // Getriebefrage gestellt wurde (inquiry.gearbox nicht null).
      gearbox: "Getriebe",
      noPricelist: "Ohne Preisliste (Kurzablauf)",
    },
    package: {
      title: "Paket",
      category: "Kategorie",
      item: "Position",
      price: "Preis",
      total: "Richtpreis",
      empty: "Keine Positionen gewählt.",
      adviceRequested: "Komplettpaket, Beratung gewünscht",
    },
    checks: {
      title: "Prüfhinweise",
      empty: "Keine Prüfhinweise.",
    },
    message: {
      title: "Freitext des Kunden",
    },
    rawText: {
      title: "Rohtext (Schnellweg)",
    },
    draft: {
      title: "Antwortentwurf",
      subject: "Betreff",
      body: "Text",
      save: "Speichern",
      saved: "Entwurf gespeichert.",
      regenerate: "Entwurf neu erzeugen",
      regenerated: "Entwurf neu erzeugt, noch nicht gespeichert.",
      copy: "Kopieren",
      copied: "In Zwischenablage kopiert.",
      copyFailed: "Kopieren nicht möglich, bitte manuell markieren.",
      send: "Senden",
      sending: "Wird gesendet …",
      sent: "Antwort gesendet.",
      sendFailed: "Versand fehlgeschlagen: {error}",
      confirmTitle: "Antwort senden?",
      confirmBody: "Die Mail geht an {email}. Status wird auf «Beantwortet» gesetzt, konfigurierte Follow-ups werden geplant.",
      confirmSend: "Jetzt senden",
      hintBcc: "Kopie (BCC) geht an {bcc}.",
      hintReplyTo: "Antworten des Kunden gehen an {replyTo}.",
      hintOverride: "Testmodus aktiv: alle Mails gehen tatsächlich an {override}.",
    },
    mailLog: {
      title: "Mail-Protokoll",
      empty: "Noch keine Mails versendet.",
      columns: { type: "Typ", to: "Empfänger", status: "Status", error: "Fehler", sentAt: "Zeit" },
    },
    followups: {
      title: "Follow-ups",
      empty: "Keine Follow-ups geplant.",
      columns: { rule: "Regel", status: "Status" },
      scheduled: "Geplant für {date}",
      sent: "Gesendet am {date}",
      cancelled: "Storniert",
    },
    share: {
      title: "Teilen-Link",
      description: "Read-only Ansicht der Anfrage für den Kunden.",
    },
  },
  settings: {
    title: "Einstellungen",
    subtitle: "Absender, Signatur und Firmenadresse für Mails und Antwortentwurf.",
    save: "Speichern",
    saved: "Einstellungen gespeichert.",
    fields: {
      mail_from_name: { label: "Absendername", help: "Anzeigename im Mailclient des Kunden, z.B. «dÄHLer Competition Line AG»." },
      mail_from: { label: "Absenderadresse", help: "Von-Adresse auf daehler.com. Solange RESEND_FROM_OVERRIDE gesetzt ist, überschreibt diese Umgebungsvariable die tatsächliche Absenderadresse." },
      mail_inbox: { label: "Anfrage-Posteingang", help: "Empfänger der internen Anfrage-Mail mit Zusammenfassung und Antwortentwurf." },
      mail_bcc: { label: "BCC", help: "Kopie jeder an den Kunden gesendeten Mail (Bestätigung, Antwort, Follow-up)." },
      mail_reply_to: { label: "Reply-To", help: "Antworten des Kunden landen an dieser Adresse." },
      signature_name: { label: "Signatur, Name", help: "Unterschrift im Antwortentwurf, z.B. «Christoph Dähler»." },
      signature_phone: { label: "Signatur, Telefon", help: "Telefonnummer in der Signatur." },
      company_address: { label: "Firmenadresse", help: "Firmenzeile in Signatur und Mail-Fusszeile." },
    },
    overrides: {
      title: "Testmodus (Umgebungsvariablen)",
      description: "Wird nicht hier, sondern in der Server-Umgebung gesetzt. Nur zur Kontrolle sichtbar.",
      mailToActive: "MAIL_TO_OVERRIDE aktiv: alle Mails gehen tatsächlich an {value}.",
      mailToInactive: "MAIL_TO_OVERRIDE nicht gesetzt.",
      resendFromActive: "RESEND_FROM_OVERRIDE aktiv: Absenderadresse überschrieben auf {value}.",
      resendFromInactive: "RESEND_FROM_OVERRIDE nicht gesetzt.",
    },
  },
  confirm: {
    yes: "Ja",
    cancel: "Abbrechen",
  },
  pricelists: {
    title: "Preislisten",
    subtitle: "Excel-Preislisten importieren, Änderungen prüfen und übernehmen. Das Kundendokument bleibt das PDF auf der Website.",
    upload: {
      title: "Preislisten hochladen",
      dropHint: "Dateien hierher ziehen oder auswählen",
      dropHintActive: "Loslassen zum Hochladen",
      pickButton: "Dateien auswählen",
      fileTypes: ".xls, .xlsx – maximal 50 Dateien, je maximal 10 MB",
      selectedCount: "{count} Datei(en) ausgewählt",
      submit: "Hochladen und Diff berechnen",
      submitting: "Wird hochgeladen …",
      clear: "Auswahl leeren",
      tooMany: "Höchstens 50 Dateien auf einmal.",
      tooLarge: "«{name}» ist grösser als 10 MB.",
      wrongType: "«{name}» ist keine .xls/.xlsx-Datei.",
      noFiles: "Bitte mindestens eine Datei auswählen.",
      resultOk: "{families} Familie(n) verarbeitet, {errors} Datei(en) mit Fehler.",
      resultFailed: "Hochladen fehlgeschlagen: {error}",
      fileErrorsTitle: "Nicht gelesene Dateien",
    },
    pending: {
      title: "Zu prüfen",
      empty: "Keine offenen Importe.",
      uploadedAt: "Hochgeladen am {date}",
      files: "Dateien: {files}",
      apply: "Übernehmen",
      applying: "Wird übernommen …",
      discard: "Verwerfen",
      discarding: "Wird verworfen …",
      confirmApplyTitle: "Import übernehmen?",
      confirmApplyBody: "Die Änderungen werden in die Datenbank übernommen. Dies kann nicht rückgängig gemacht werden.",
      confirmDiscardTitle: "Import verwerfen?",
      confirmDiscardBody: "Der berechnete Diff wird verworfen, es ändert sich nichts an der Datenbank.",
      applyResultTitle: "Ergebnis",
      applyResultOk: "{count} Familie(n) übernommen.",
      applyResultErrors: "{count} Familie(n) mit Fehler.",
      close: "Schliessen",
      counters: {
        familiesNew: "{count} neue Baureihe(n)",
        familiesExisting: "{count} bestehende Baureihe(n)",
        models: "Modelle: +{added} / -{removed}",
        products: "Produkte: +{added} ~{changed} -{removed} ={unchanged}",
        notes: "{count} Hinweistext(e)",
        warnings: "{count} Warnung(en)",
      },
    },
    family: {
      new: "Neu",
      existing: "Bestehend",
      matchedByFallback: "Über Dateiname zugeordnet (Slug abweichend)",
      modelsAdded: "Neue Modelle",
      modelsRemoved: "Entfernte Modelle",
      productsAdded: "Neue Produkte",
      productsChanged: "Geänderte Produkte",
      productsRemoved: "Entfernte Produkte",
      warnings: "Parser-Warnungen",
      notes: "Hinweistexte",
      columns: {
        name: "Name",
        category: "Kategorie",
        price: "Preis",
        status: "Status",
        field: "Feld",
        old: "Vorher",
        new: "Nachher",
      },
    },
    fields: {
      category: "Kategorie",
      source_category: "Excel-Kategorie",
      group_label: "Gruppe",
      description: "Beschreibung",
      article_no: "Artikelnummer",
      rc: "RC",
      price_parts: "Teilepreis",
      price_install: "Montagepreis",
      price_approval: "Gutachten",
      price_total: "Komplettpreis",
      price_status: "Preisstatus",
      price_note: "Preishinweis",
      ps_base: "Basis-PS",
      ps_to: "Ziel-PS",
      nm_to: "Ziel-Nm",
      variant_group: "Variantengruppe",
      fits: "Passend für",
    },
    history: {
      title: "Import-Historie",
      empty: "Noch keine Importe.",
      columns: { date: "Datum", files: "Dateien", status: "Status", counts: "Zähler" },
      status: { pending: "Offen", applied: "Übernommen", discarded: "Verworfen", failed: "Fehlgeschlagen" } as const,
    },
  },
  models: {
    title: "Modelle",
    subtitle: "Fotos, Kurzbeschriebe und Serienwerte pflegen.",
    list: {
      columns: {
        photo: "Foto",
        name: "Baureihe",
        brand: "Marke",
        pricelist: "Preisliste",
        active: "Aktiv",
        models: "Modelle",
        products: "Produkte",
      },
      noPhoto: "Foto fehlt",
      pricelistYes: "Ja",
      pricelistNo: "Nein (Platzhalter)",
      empty: "Keine Baureihen gefunden.",
    },
    detail: {
      back: "Zu den Modellen",
      photo: {
        title: "Foto",
        current: "Aktuelles Foto",
        none: "Kein Foto hinterlegt.",
        upload: "Foto hochladen",
        replace: "Foto ersetzen",
        remove: "Foto entfernen",
        uploading: "Wird hochgeladen …",
        removing: "Wird entfernt …",
        hint: "JPG, PNG oder WebP, maximal 8 MB.",
        tooLarge: "Datei ist grösser als 8 MB.",
        wrongType: "Bitte JPG, PNG oder WebP wählen.",
        uploaded: "Foto gespeichert.",
        removed: "Foto entfernt.",
      },
      meta: {
        title: "Angaben",
        name: "Name",
        nameHint: "Nur bei Platzhalter-Baureihen ohne Preisliste editierbar.",
        shortText: "Kurzbeschrieb",
        sort: "Sortierung",
        active: "Aktiv (im Kundenflow sichtbar)",
        save: "Speichern",
        saved: "Gespeichert.",
      },
      placeholderBadge: "Platzhalter ohne Preisliste",
      models: {
        title: "Modelle",
        empty: "Keine Modelle in dieser Baureihe.",
        columns: {
          name: "Name",
          fuel: "Kraftstoff",
          seriesPs: "Serien-PS",
          seriesNm: "Serien-Nm",
          active: "Aktiv",
          products: "Produkte",
        },
        suggested: "Vorschläge",
        save: "Speichern",
        saved: "Gespeichert.",
      },
      fuel: { benzin: "Benzin", diesel: "Diesel", elektro: "Elektro" } as const,
    },
  },
  followups: {
    title: "Follow-ups",
    subtitle: "Regeln für automatische Nachfassmails nach einer beantworteten Anfrage.",
    table: {
      columns: { name: "Name", days: "Tage nach Antwort", maxCount: "Max. Anzahl", active: "Aktiv" },
      empty: "Keine Regeln angelegt.",
      edit: "Bearbeiten",
      new: "Neue Regel",
      delete: "Löschen",
      deleteConfirmTitle: "Regel löschen?",
      deleteConfirmBody: "Die Regel wird endgültig gelöscht.",
      deleted: "Regel gelöscht.",
      deactivated: "Regel deaktiviert (offene Follow-ups vorhanden, Löschen daher nicht möglich).",
    },
    form: {
      titleNew: "Neue Regel",
      titleEdit: "Regel bearbeiten",
      name: "Name",
      daysAfterReply: "Tage nach Antwort",
      maxCount: "Maximale Anzahl",
      subject: "Betreff",
      body: "Text",
      sort: "Sortierung",
      active: "Aktiv",
      placeholdersHint: "Platzhalter: {{vorname}}, {{name}}, {{fahrzeug}}, {{nummer}}",
      unknownPlaceholder: "Unbekannter Platzhalter: {placeholder}",
      previewTitle: "Vorschau mit Beispielwerten",
      previewSubject: "Betreff",
      previewBody: "Text",
      save: "Speichern",
      cancel: "Abbrechen",
      saved: "Regel gespeichert.",
      saveFailed: "Speichern fehlgeschlagen: {error}",
    },
    upcoming: {
      title: "Anstehende Follow-ups (30 Tage)",
      empty: "Keine anstehenden Follow-ups.",
      columns: { date: "Fällig am", inquiry: "Anfrage", rule: "Regel", customer: "Kunde" },
      openLink: "Öffnen",
    },
    run: {
      title: "Fällige jetzt senden",
      description: "Sendet alle fälligen, noch nicht gesendeten Follow-ups sofort (sonst über den täglichen Cron).",
      button: "Fällige Follow-ups senden",
      running: "Wird gesendet …",
      result: "{sent} gesendet, {skipped} übersprungen, {failed} fehlgeschlagen.",
    },
  },
  quick: {
    title: "Schnellweg",
    subtitle: "Freitext (Mail oder Telefonnotiz) auswerten und als Anfrage anlegen. Es wird keine Mail an den Kunden versendet.",
    input: {
      label: "Text",
      placeholder: "Mail- oder Telefonnotiz hier einfügen …",
      analyze: "Auswerten",
      analyzing: "Wird ausgewertet …",
      analyzeError: "Auswertung fehlgeschlagen: {error}",
    },
    uncertainBadge: "Unsicher",
    openQuestions: "Offene Fragen",
    form: {
      resultTitle: "Ergebnis, bitte prüfen und korrigieren",
      vehicleTitle: "Fahrzeug",
      family: "Baureihe",
      familyNone: "Keine Auswahl",
      model: "Modell",
      modelNone: "Keine Auswahl",
      // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
      // Motorisierungen, das Modell ist X1 oder X2"): nur sichtbar, wenn
      // die Baureihe für die gewählte Motorisierung mehrdeutig ist (siehe
      // QuickInquiryForm.tsx lineOptions).
      line: "Modell (Baureihe mehrdeutig)",
      lineNone: "Keine Auswahl",
      vehicleText: "Fahrzeugtext (frei, z.B. wenn kein Modell zuordenbar)",
      year: "Baujahr",
      categoriesTitle: "Kategorien",
      categories: {
        motor: "Motor",
        auspuff: "Auspuff",
        fahrwerk: "Fahrwerk",
        raeder: "Räder",
        exterieur: "Exterieur",
        interieur: "Interieur",
      } as const,
      productsTitle: "Produkte",
      productsSearchPlaceholder: "Produkt suchen …",
      productsEmpty: "Bitte zuerst ein Modell wählen.",
      productsNoneInCategory: "Keine Produkte in dieser Kategorie.",
      consulting: "Komplettpaket, Beratung gewünscht",
      characterTitle: "Charakter",
      character: { dezent: "Dezent", sportlich: "Sportlich", maximum: "Maximum" } as const,
      timingTitle: "Termin",
      timing: {
        asap: "So bald wie möglich",
        m1_2: "In 1 bis 2 Monaten",
        m3_6: "In 3 bis 6 Monaten",
        flexible: "Flexibel",
      } as const,
      contactTitle: "Kontakt",
      firstName: "Vorname",
      lastName: "Name",
      city: "Ort",
      phone: "Telefon",
      email: "E-Mail",
      channel: "Bevorzugter Kanal",
      channelNone: "Keine Auswahl",
      channels: { phone: "Telefon", email: "E-Mail", whatsapp: "WhatsApp" } as const,
      message: "Nachricht",
      missingTitle: "Fehlende oder ungültige Angaben",
      // Mapping zod-Feldpfad (toInquiryPayload()/QuickInquiryPayloadSchema,
      // lib/ai/to-payload.ts, `missing`: ein Eintrag je zod-issue-Pfad, z.B.
      // "familyId", "phone") -> deutsche Bezeichnung (Prüfbefund
      // admin-quick, Punkt 5: "keine rohen Pfade" in der UI). Deckt alle
      // Felder aus InquiryPayloadObjectSchema/QuickInquiryPayloadSchema ab;
      // missingFieldFallback greift nur, falls das Schema künftig ein
      // weiteres Feld bekommt, das hier noch nicht nachgetragen wurde.
      missingFieldLabels: {
        locale: "Sprache",
        familyId: "Baureihe",
        modelId: "Modell",
        vehicleText: "Fahrzeugtext",
        year: "Baujahr",
        beenHere: "Schon einmal bei uns gewesen",
        gearbox: "Getriebe",
        // Kundenentscheid 17.09.2026: line ist in InquiryPayloadObjectSchema
        // optional (siehe lib/inquiry/schema.ts) und wird von
        // QuickInquiryPayloadSchema unverändert übernommen - zod meldet es
        // nie als fehlend, der Eintrag deckt trotzdem das Schema vollständig
        // ab (Test tests/admin/quick-missing-labels.test.ts), analog seriesPs.
        line: "Modell (Baureihe mehrdeutig)",
        // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
        // Punkt 3): seriesPs ist in InquiryPayloadObjectSchema optional
        // (siehe lib/inquiry/schema.ts), zod meldet es deshalb nie als
        // fehlend - der Eintrag deckt trotzdem das Schema vollständig ab
        // (Test tests/admin/quick-missing-labels.test.ts).
        seriesPs: "Serienleistung",
        categories: "Kategorien",
        consulting: "Komplettpaket, Beratung gewünscht",
        selections: "Produktauswahl",
        followUpAnswers: "Rückfragen",
        character: "Charakter",
        timing: "Termin",
        firstName: "Vorname",
        lastName: "Name",
        city: "Ort",
        phone: "Telefon",
        email: "E-Mail",
        channel: "Bevorzugter Kanal",
        message: "Nachricht",
        privacyAccepted: "Datenschutz",
      } as Record<string, string>,
      missingFieldFallback: "Weitere Pflichtangabe",
      create: "Anfrage anlegen",
      creating: "Wird angelegt …",
      createError: "Anfrage anlegen fehlgeschlagen: {error}",
    },
  },
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
        // Überschrift über dem Klartext-Block der Vorher/Nachher-Übersicht
        // (lib/mail/render.ts monoBlock()), direkt nach GESCHÄTZTES PAKET -
        // Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dÄHLer soll intern
        // dasselbe Vorher/Nachher sehen wie der Kunde in der Mail.
        beforeAfter: "VORHER / NACHHER",
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

// Nachzug Prüfung Phase D, Punkt 5: der Fehler-Toast in
// components/admin/QuickInquiryForm.tsx handleCreate() und der von
// app/api/admin/quick/create/route.ts gebaute error-Text zeigten rohe
// zod-Feldpfade ("familyId, year, firstName ...") statt der deutschen
// Bezeichnung, obwohl die Liste im selben Formular (`missing`-Block) bereits
// über admin.quick.form.missingFieldLabels übersetzt. Gemeinsame Helfer
// hier (statt einer eigenen Kopie je Aufrufer, wie zuvor in
// QuickInquiryForm.tsx missingFieldLabel()), damit Formular-Liste,
// Fehler-Toast und die serverseitige Fehlermeldung dieselbe Übersetzung
// verwenden.

/** zod-Feldpfad (aus `missing`, siehe lib/ai/to-payload.ts toInquiryPayload()) -> deutsche Bezeichnung. */
export function missingFieldLabel(path: string): string {
  return admin.quick.form.missingFieldLabels[path] ?? admin.quick.form.missingFieldFallback;
}

/** Mehrere zod-Feldpfade zu einer deutschen, komma-getrennten Liste. */
export function formatMissingFields(missing: string[]): string {
  return missing.map(missingFieldLabel).join(", ");
}
