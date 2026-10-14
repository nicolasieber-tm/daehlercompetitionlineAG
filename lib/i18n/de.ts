// Deutsches Dictionary (Standardsprache). Sie-Form gegenüber Endkunden,
// Schweizer Schreibweise (ss statt ß), keine Gedankenstriche in
// Kundentexten. Referenz für Inhalt und Ablauf: docs/vorschau.html
// (dort im informellen Ton, hier konsequent auf die Sie-Form umgeschrieben).
export const de = {
  brand: {
    name: "dÄHLer",
    tagline: "Competition Line · Belp",
    websiteUrl: "https://www.daehler.com",
    websiteLabel: "Zur Webseite daehler.com",
    eyebrow: "Ihre Anfrage in wenigen Schritten",
    title: "Ihre Anfrage für mehr",
    titleHighlight: "Charakter",
    lede: "Wählen Sie Ihr Fahrzeug und Ihren Wunsch. Wir zeigen Ihnen die passenden Optionen aus unserer Produkteliste, mit Richtpreisen live dabei.",
    meta: {
      locationLabel: "Standort",
      location: "Belp",
      phoneLabel: "Telefon",
      phone: "+41 31 819 88 77",
      responseLabel: "Antwort",
      response: "Innert 1 Arbeitstag",
    },
  },

  language: {
    de: "DE",
    en: "EN",
    switchLabel: "Sprache",
  },

  nav: {
    back: "Zurück",
    next: "Weiter",
    submit: "Anfrage senden",
    soFar: "Bisher {price}",
    stepOf: "Schritt {current} von {total}",
    toInternal: "So kommt es bei dÄHLer an",
    retry: "Erneut versuchen",
  },

  priceStatus: {
    // {price} kommt bereits formatiert inkl. Präfix aus chfFrom() (z.B.
    // "ab CHF 4'180"), deshalb hier ohne eigenes "ab" (sonst "ab ab ...").
    priced: "{price}",
    in_preparation: "in Vorbereitung",
    on_request: "auf Anfrage",
  },

  steps: {
    car: {
      label: "Ihr Fahrzeug",
      question: "Welches Fahrzeug fahren Sie?",
      yearLabel: "Baujahr",
      yearOlder: "älter",
      beenHereLabel: "Schon einmal bei uns gewesen?",
      beenHereNo: "Nein",
      beenHereYes: "Ja",
      seriesKnown: "{ps} PS Serie und {nm} Nm Serie",
      seriesUnknown: "Die Serienleistung tragen wir für Sie nach.",
      // Rückmeldung dÄHLer 14.10.2026: die Versions-Chips (z.B. M2 / M2 CS)
      // standen bisher ohne Überschrift unter den Baureihen-Kacheln und
      // wurden übersehen.
      modelQuestion: "Welche Version fahren Sie?",
      modelRequired: "Bitte tippen Sie auf Ihre Version.",
      changeResetsSelection:
        "Wenn Sie das Fahrzeug ändern, wird Ihre bisherige Produktauswahl zurückgesetzt. Trotzdem ändern?",
      seriesPsChoice: "Welche Serienleistung hat Ihr Fahrzeug?",
      seriesPsRequired: "Bitte wählen Sie Ihre Serienleistung, damit wir passende Optionen zeigen können.",
      // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt
      // 3): nur sichtbar, wenn das gewählte Modell mindestens ein
      // getriebespezifisches Produkt hat (CatalogModel.
      // hasGearboxSpecificProducts), Pflicht vor "Weiter" wie die
      // Serienleistungs-Chips.
      gearboxQuestion: "Welches Getriebe hat Ihr Fahrzeug?",
      gearboxManual: "Handschalter",
      gearboxAutomatic: "Automat",
      gearboxUnknown: "Weiss ich nicht",
      gearboxRequired: "Bitte wählen Sie Ihr Getriebe, damit wir passende Optionen zeigen können.",
      // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
      // Motorisierungen, das Modell ist X1 oder X2"): nur sichtbar, wenn
      // die Baureihe für die gewählte Motorisierung mehrdeutig ist
      // (lib/catalog/vehicle-label.ts vehicleLineOptions()), Pflicht vor
      // "Weiter" wie Serienleistung/Getriebe oben.
      lineQuestion: "Welches Modell fahren Sie?",
      lineRequired: "Bitte wählen Sie Ihr Modell, damit wir es richtig bezeichnen können.",
      // Entscheid 21.09.2026 (Karosserieform/Antrieb, lib/catalog/
      // body-style.ts, lib/catalog/drive.ts): nur sichtbar, wenn das Modell
      // Produkte mit unterschiedlichen Karosserieformen bzw. Antrieben hat
      // (CatalogModel.bodyStyleOptions/driveOptions), Pflicht vor "Weiter".
      bodyStyleQuestion: "Welche Karosserieform hat Ihr Fahrzeug?",
      bodyStyleRequired: "Bitte wählen Sie die Karosserieform, damit wir passende Fahrwerksoptionen zeigen können.",
      bodyStyles: {
        limousine: "Limousine",
        touring: "Touring",
        gran_turismo: "Gran Turismo",
        coupe: "Coupé",
        cabrio: "Cabrio",
        gran_coupe: "Gran Coupé",
        dreituerer: "3-Türer",
        fuenftuerer: "5-Türer",
      },
      driveQuestion: "Welchen Antrieb hat Ihr Fahrzeug?",
      driveRequired: "Bitte wählen Sie den Antrieb, damit wir passende Fahrwerksoptionen zeigen können.",
      drives: {
        rwd: "Heckantrieb",
        xdrive: "xDrive",
      },
      photoHint: "Preise hinterlegt",
      photoFallback: "Foto folgt",
      carShotCaption: "{model} by dÄHLer",
      fuelGroups: {
        benzin: "Benzin",
        diesel: "Diesel",
        elektro: "Elektro",
      },
    },

    wish: {
      label: "Ihr Wunsch",
      question: "Was darf es sein?",
      subtitle:
        "Wählen Sie alles, was Sie interessiert. Die Details fragen wir gleich danach, nur zu dem, was Sie angeklickt haben.",
      categories: {
        motor: { title: "Motor", subtitle: "Mehr Leistung, homologiert" },
        auspuff: { title: "Auspuff", subtitle: "Sound und Optik" },
        fahrwerk: { title: "Fahrwerk", subtitle: "Tiefer, präziser" },
        raeder: { title: "Räder", subtitle: "CDC1 und CDC2 Forged" },
        exterieur: { title: "Exterieur", subtitle: "Carbon und Aerodynamik" },
        interieur: { title: "Interieur", subtitle: "Lenkrad, Leder, Details" },
      },
      completePackage: {
        title: "Oder: Komplettpaket, beraten Sie mich",
        subtitle: "Sagen Sie uns, wie er wirken soll, wir stellen das Paket zusammen.",
        cta: "Beraten lassen",
        selected: "Gewählt",
      },
    },

    category: {
      questions: {
        motor: "Wie viel darf es sein?",
        auspuff: "Welcher Sound?",
        fahrwerk: "Wie tief, wie hart?",
        raeder: "Welche Räder?",
        exterieur: "Was kommt dran?",
        interieur: "Was kommt rein?",
      },
      // Rückmeldung dÄHLer 14.10.2026: klar machen, dass Produkte angetippt
      // werden müssen, und warnen, wenn eine gewählte Kategorie ohne Produkt
      // bleibt (sonst steht sie in der Anfrage nur als Wunsch ohne Position).
      pickTitle: "Produkte auswählen",
      pickHint: "Tippen Sie auf die gewünschten Produkte. Nur ausgewählte Produkte erscheinen in Ihrer Anfrage.",
      pickedOne: "1 Produkt ausgewählt",
      pickedMany: "{count} Produkte ausgewählt",
      followUpHint: "Freiwillig, hilft uns bei der Beratung. Ersetzt die Produktauswahl oben nicht.",
      emptyWarning: {
        title: "Noch kein Produkt ausgewählt",
        text: "Bei {category} haben Sie noch kein Produkt angetippt. Wählen Sie oben ein Produkt, damit es in Ihrer Anfrage erscheint. Möchten Sie sich dazu lieber beraten lassen, tippen Sie nochmals auf «Weiter».",
      },
      tailpipeHint:
        "Ihr gewählter Endschalldämpfer wird ohne Endrohre geliefert. Wählen Sie oben passende Endrohre dazu, oder wir beraten Sie dazu.",
      loading: "Produkte werden geladen …",
      priceHintData:
        "Richtpreise «ab» aus unserer Produkteliste für den {model}, inklusive Einbau, ohne MFK.",
      priceHintGeneric: "Für dieses Fahrzeug nennen wir Ihnen die Preise persönlich.",
      // Rückmeldung Klicktest 22.09.2026: Varianten (eine davon, Kreis-
      // Indikator) und Ergänzungen (kombinierbar, Quadrat) stehen je Raster
      // als eigene Blöcke mit dieser Zeile darüber, siehe CategoryStep.tsx
      // clusterProducts(). Ersetzt die nie gerenderten variantHint/multiHint
      // aus der Vorschau («Eine Variante, Ergänzungen beliebig dazu.»).
      cluster: {
        single: "Eine Variante wählen",
        singlePerAxle: "Je Achse eine Variante wählen",
        extras: "Ergänzungen, kombinierbar",
        multi: "Mehrfachauswahl möglich",
      },
      // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt
      // 2): Zwischenüberschriften im Motor-Schritt, gruppiert nach
      // variant_group/source_category (siehe components/flow/steps/
      // CategoryStep.tsx), damit "Leistungsstufen" nicht mehr mit "Weitere
      // Optionen" (Sportluftfilter, V/max, ...) und "Kraftübertragung"
      // (Schaltwegverkürzung, Getriebeoptimierung) in einer Liste stehen.
      motorSections: {
        leistungsstufen: "Leistungsstufen",
        weitereOptionen: "Weitere Optionen",
        kraftuebertragung: "Kraftübertragung",
      },
      // Analoge Zwischenüberschriften für Auspuff (Anlagen/Endrohre/Weitere
      // Optionen/Active-Sound) und Fahrwerk (Fahrwerk/Weitere Optionen/
      // Bremse), über source_category/variant_group ermittelt statt über
      // Namenslisten - siehe CategoryStep.tsx buildSubsections(). Ein
      // gemeinsames Wörterbuch statt je Kategorie eigener Schlüssel, da
      // "Weitere Optionen" und "Bremse"/"Fahrwerk" wortgleich wiederkehren.
      sections: {
        anlagen: "Anlagen",
        endrohre: "Endrohre",
        weitereOptionen: "Weitere Optionen",
        activeSound: "Active-Sound",
        fahrwerk: "Fahrwerk",
        bremse: "Bremse",
      },
      psCounter: {
        seriesUnit: "PS Serie",
        targetUnitWithStage: "PS mit {stage}",
        targetUnitUnselected: "PS · wählen Sie eine Stufe",
        plus: "+{diff} PS · {detail}",
      },
      // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
      // Punkt 1): Sperr-Hinweis an einer Kachel, deren V/max-Aufhebung
      // bereits Teil einer gewählten Leistungsstufe ist (components/flow/
      // state.ts isVmaxLocked(), CategoryStep.tsx).
      includedInStage: "In {stage} enthalten",
      followUp: {
        motor: {
          question: "Was ist Ihnen wichtiger?",
          options: [
            { id: "leistung", label: "Mehr Leistung" },
            { id: "sound", label: "Mehr Sound" },
            { id: "beides", label: "Beides" },
          ],
        },
        auspuff: {
          question: "Wie laut darf er sein?",
          options: [
            { id: "dezent", label: "Dezent, mit Klappe" },
            { id: "kraeftig", label: "Kräftig" },
            { id: "rennstrecke", label: "Rennstrecke" },
          ],
        },
        fahrwerk: {
          question: "Wie fahren Sie ihn meistens?",
          options: [
            { id: "alltag", label: "Alltag" },
            { id: "pass", label: "Pass und Kurven" },
            { id: "track", label: "Trackdays" },
          ],
        },
        raeder: {
          question: "Welche Oberfläche?",
          options: [
            { id: "schwarz", label: "Schwarz matt" },
            { id: "silber", label: "Silber" },
            { id: "wunschfarbe", label: "Wunschfarbe" },
          ],
        },
      },
      upsell: {
        motor: {
          title: "Passt gut dazu: Auspuff",
          text: "Die meisten nehmen zur Leistungssteigerung die Abgasanlage dazu. Dann hören Sie den Unterschied auch.",
        },
        auspuff: {
          title: "Passt gut dazu: Motor",
          text: "Sound ist da, Leistung noch nicht. Stufe 1 ist Software, homologiert, mit Garantie-Ergänzung.",
        },
        fahrwerk: {
          title: "Passt gut dazu: Räder",
          text: "Tiefer und dann Serienräder? Die CDC-Radsätze füllen die Radhäuser erst richtig.",
        },
        raeder: {
          title: "Passt gut dazu: Fahrwerk",
          text: "Neue Räder kommen mit Sportfedern noch besser zur Geltung.",
        },
        exterieur: {
          title: "Passt gut dazu: Interieur",
          text: "Aussen Carbon, innen Serie? Das Alcantara-Lenkrad ist der Griff, den Sie jeden Tag spüren.",
        },
        interieur: {
          title: "Passt gut dazu: Exterieur",
          text: "Passend dazu: Carbon-Details aussen, vom Grill bis zum Diffusor.",
        },
      },
      upsellAdd: "Dazunehmen",
      upsellAdded: {
        titleSuffix: "ist dabei",
        subtitle: "Kommt als nächster Schritt.",
        remove: "Doch nicht",
      },
    },

    character: {
      label: "Der Charakter",
      question: "Wie soll Ihr {model} am Ende wirken?",
      options: [
        {
          id: "dezent",
          title: "Dezent",
          description: "Man sieht es nicht, man hört es kaum, man spürt es.",
        },
        {
          id: "sportlich",
          title: "Sportlich",
          description: "Klar erkennbar, aber alltagstauglich.",
        },
        { id: "maximum", title: "Maximum", description: "Alles, was homologiert geht." },
      ],
      noteLabel: "Noch etwas, das wir wissen sollten? (optional)",
      notePlaceholder:
        "z.B. Garantie läuft noch bis 2027, oder: Räder sollen zum Frozen-Lack passen",
    },

    timing: {
      label: "Fast fertig",
      question: "Wann passt es Ihnen?",
      options: [
        { id: "asap", label: "So bald wie möglich" },
        { id: "m1_2", label: "In 1 bis 2 Monaten" },
        { id: "m3_6", label: "In 3 bis 6 Monaten" },
        { id: "flexible", label: "Flexibel" },
      ],
    },

    contact: {
      emptyCategories: {
        title: "Bereiche ohne Produktauswahl",
        text: "Hier haben Sie noch kein Produkt ausgewählt. Wir beraten Sie gerne dazu, oder Sie wählen jetzt noch etwas aus.",
        pick: "{category} auswählen",
      },
      label: "Und wer sind Sie?",
      firstName: "Vorname",
      lastName: "Name",
      // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
      // Punkt 2): Ort ist kein Pflichtfeld mehr, Label macht das kenntlich.
      city: "Ort (optional)",
      phone: "Telefon",
      email: "E-Mail",
      channelLabel: "Wie erreichen wir Sie am liebsten?",
      channels: [
        { id: "phone", label: "Telefon" },
        { id: "email", label: "E-Mail" },
        { id: "whatsapp", label: "WhatsApp" },
      ],
      privacyNote:
        "Mit dem Absenden akzeptieren Sie die Datenschutzbestimmungen. Wir melden uns innert einem Arbeitstag mit einem konkreten Vorschlag für Ihren {model}.",
    },

    done: {
      ticketLabel: "Anfrage eingegangen · Nr. {number}",
      title: "Vielen Dank, {first}. Das wird gut.",
      subtitle:
        "Ihr {model} ist bei uns notiert. Die Bestätigung mit dieser Übersicht ist unterwegs an {email}. Wir prüfen, was in der Kombination passt, und melden uns innert einem Arbeitstag per {channel}.",
      carShotCaption: "{model} · vorher / nachher",
      beforeAfter: {
        header: "Ihr Paket",
        before: "Vorher",
        after: "Nachher · by dÄHLer",
        rows: {
          leistung: "Leistung",
          sound: "Sound",
          fahrwerk: "Fahrwerk",
          raeder: "Räder",
          exterieur: "Exterieur",
          interieur: "Interieur",
          charakter: "Charakter",
        },
        seriesValue: "Serie",
        seriesHeightValue: "Serienhöhe",
        seriesFactoryValue: "Ab Werk",
        seriesExhaustValue: "Serienanlage",
        seriesWheelsValue: "Serienräder",
        adviceValue: "Beratung",
      },
      share: {
        link: {
          title: "Ihr Paket als Link",
          subtitle: "Zum Teilen mit Kollegen, Partnerin, Stammtisch.",
          success: {
            title: "Link kopiert",
            subtitle: "Schicken Sie ihn dem Kollegen, der auch schon lange überlegt.",
          },
        },
      },
      package: {
        header: "Ihr Paket",
        adviceLine: "Komplettpaket · Beratung gewünscht",
        // Zeile je Kategorie ohne Produktauswahl (Komplettpaket nicht gewählt).
        categoryAdviceLine: "Beratung gewünscht",
        total: "Richtpreis, unverbindlich",
        totalWithOnRequest: "Richtpreis, unverbindlich, ohne Positionen auf Anfrage",
        onRequest: "auf Anfrage",
      },
      next: {
        now: { title: "Jetzt", text: "Die Bestätigung per Mail ist unterwegs." },
        day1: {
          title: "Innert 1 Arbeitstag",
          text: "Konkretes Angebot mit Preis.",
        },
        then: { title: "Dann", text: "Sie bringen ihn vorbei. Wir machen den Rest." },
      },
      restart: "Nochmals von vorne",
      ownRequest: "Neue Anfrage starten",
    },
  },

  errors: {
    required: "Dieses Feld ist ein Pflichtfeld.",
    invalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    selectAtLeastOne: "Bitte wählen Sie mindestens eine Kategorie oder das Komplettpaket.",
    generic: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    submitFailed: "Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
    privacyRequired: "Bitte akzeptieren Sie die Datenschutzbestimmungen.",
    loadFailed: "Die Produkte konnten nicht geladen werden.",
    shareCopyFailed: "Der Link konnte nicht kopiert werden.",
    // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
    // Punkt 2): Telefon ist nur bei Kanal Telefon/WhatsApp Pflicht.
    phoneRequiredForChannel: "Telefon ist bei Kontakt per Telefon oder WhatsApp ein Pflichtfeld.",
  },

  mail: {
    // Bausteine, die in mehreren Vorlagen vorkommen (lib/mail/render.ts).
    shared: {
      viewPackageButton: "Ihr Paket ansehen",
      // Überschrift über der Vorher/Nachher-Tabelle in confirmation
      // (lib/mail/render.ts beforeAfterTable(), Kundenwunsch: dieselbe
      // Übersicht wie im Abschluss-Screen des Flows auch in den Mails).
      beforeAfterTitle: "Vorher / Nachher",
    },
    confirmation: {
      subject: "Ihre Anfrage für den {model}, Nr. {number}",
      // Einleitung und Schluss: im Admin bearbeitbar, siehe lib/mail/texts.ts.
      withoutProducts: "Ohne Produktauswahl, dazu beraten wir Sie gerne persönlich: {categories}.",
      // Zeilenbeschriftungen der Zusammenfassung (Fahrzeug, Wunsch, Termin,
      // Kontaktkanal), siehe docs/architektur.md, Abschnitt "Anfrage anlegen".
      vehicleLabel: "Fahrzeug",
      wishLabel: "Wunsch",
      timingLabel: "Termin",
      channelLabel: "Kontakt",
      // Erster Schritt der «nächsten Schritte» in der Mail: nicht «Bestätigung
      // ist unterwegs» (der Kunde liest sie gerade), sondern der Eingang.
      nowText: "Ihre Anfrage ist bei uns eingegangen und notiert.",
    },
    // Interne Mail an settings.mail_inbox (nicht an den Kunden, siehe
    // docs/architektur.md, Abschnitt "Anfrage anlegen"): strukturierte
    // Zusammenfassung, Prüfhinweise, Antwortentwurf, Admin-Link.
    inbox: {
      subject: "Neue Anfrage {number}: {vehicle}, {name}",
      intro: "Neue Anfrage über den Kundenflow auf daehler.com. Zusammenfassung, Prüfhinweise und Antwortentwurf unten, Details im Admin.",
    },
    // Betreff kommt beim Versand aus draft.subject, nicht von hier (derselbe
    // Text wie im Antwortentwurf). Nur die Fussnote ist eigens für die Mail.
    reply: {
      footer: "Dieser Richtpreis ist unverbindlich, die Kompatibilität wird geprüft.",
    },
    follow_up: {
      subject: "Ihre Anfrage für den {model}, Nr. {number}",
      intro: "Guten Tag {first},",
      body: "Wir wollten kurz nachfragen, ob unser Vorschlag für Ihren {model} noch aktuell ist. Gerne klären wir offene Fragen und vereinbaren einen Termin.",
      closing: "Sportliche Grüsse aus Belp",
    },
  },

  checks: {
    motor_auspuff_compat:
      "Kompatibilität Abgasanlage und Motorsoftware prüfen (Stufe mit Katalysatoren abstimmen).",
    stufe2_ohne_kats: "Stufe 2 gewählt, Hochleistungskatalysatoren nicht im Paket.",
    in_vorbereitung: "Position «in Vorbereitung» gewählt, Zeithorizont nennen.",
    fahrwerk_einbausatz:
      "Serienfahrwerk adaptiv? Einbausatz nötig, Sportfedern auf EDC abstimmen.",
    raeder_details: "Reifendimension, Distanzscheiben und Wunschfarbe klären.",
    exterieur_lack: "Carbon oder lackiert? Lackcode vom Fahrzeug einholen.",
    baujahr_homologation: "Baujahr klären, Homologation je Motorvariante prüfen.",
    charakter_maximum_stufe1: "Wunsch «Maximum», aber Stufe 1 gewählt: Stufe 2 anbieten.",
    zeitraum_kapazitaet: "Werkstattkapazität im gewünschten Zeitraum prüfen.",
    familie_ohne_preisliste: "Fahrzeug ohne Preisliste: Preise und Verfügbarkeit manuell ergänzen.",
    produkt_auf_anfrage: "Position mit Status «auf Anfrage» gewählt: Preis manuell bestätigen.",
    komplettpaket_gewuenscht: "Komplettpaket gewünscht: Vorschlag nach Charakter zusammenstellen.",
    getriebe_unbekannt:
      "Getriebespezifische Position gewählt, Getriebe (Handschalter/Automat) aber nicht bekannt: vor der Bestätigung klären.",
    vmax_doppelt:
      "Die gewählte Leistungsstufe enthält die V/max-Aufhebung bereits, zusätzlich wurde das eigenständige V/max-Produkt gewählt: doppelt, bitte bereinigen.",
    // Ergänzung 15.09.2026 (Feinschliff-Prüfung, Ambiguität X1/X2, X3/X4,
    // X5/X6): die Formel (lib/catalog/vehicle-label.ts) kann die Alternative
    // einer Baureihe nicht auflösen, wenn die Motorisierung mit keiner ein
    // Wort teilt - vehicleLineIsAmbiguous() erkennt genau das.
    // {alternatives}: die konkreten Alternativen der Familie ("X1 / X2"),
    // von runChecks() via tf() eingesetzt (lib/rules/checks.ts,
    // vehicleAmbiguousAlternatives()) - statt generischer Beispiele.
    modell_mehrdeutig: "Baureihe umfasst {alternatives}, Modell beim Kunden klären.",
    // Entscheid 21.09.2026 (Karosserieform/Antrieb): der Kundenflow blendet
    // nicht passende Varianten aus, die Hinweise bleiben als Sicherheitsnetz
    // für den Schnellweg (keine Frage gestellt) und für Positionen, die
    // trotzdem nicht zur Angabe passen.
    karosserie_unbekannt:
      "Karosserieabhängige Position gewählt (z.B. Touring/Limousine), Karosserieform aber nicht bekannt: vor der Bestätigung klären.",
    karosserie_passt_nicht:
      "Position «{item}» gilt laut Preisliste nicht für die angegebene Karosserieform ({body}): prüfen und gegebenenfalls ersetzen.",
    antrieb_unbekannt:
      "Antriebsabhängige Position gewählt (xDrive/Heckantrieb), Antrieb aber nicht bekannt: vor der Bestätigung klären.",
    antrieb_passt_nicht:
      "Position «{item}» gilt laut Preisliste nicht für den angegebenen Antrieb ({drive}): prüfen und gegebenenfalls ersetzen.",
  },

  draft: {
    // Betreff des Antwortentwurfs, wiederverwendet als Betreff für mail.reply
    // (siehe dort) und für die Anfrage-Mail (mail.inbox verwendet {vehicle}
    // aus demselben Feld, nicht {model}: der Antwortentwurf kennt auch
    // Fahrzeuge ohne zugeordnetes Modell, siehe inquiries.vehicle_text).
    subject: "Ihre Anfrage für den {vehicle}, Nr. {number}",
    // Korrektur 15.09.2026 (Feinschliff-Prüfung, Befund "Doppelklammer"):
    // {model} kann selbst schon in Klammern enden (die Codes, z.B. "BMW M2
    // (G87)") - ein weiteres, direkt folgendes "(Jahrgang 2026)" liest sich
    // wie eine zweite Klammer ("BMW M2 (G87) (Jahrgang 2026)"). Komma statt
    // Klammer trennt die beiden Angaben klar, ohne dass es wie eine
    // verschachtelte/zweite Klammer aussieht.
    yearSuffix: ", Jahrgang {year}",
    // Positionszeile mit Beschreibung und Preis, siehe docs/architektur.md,
    // Abschnitt Antwortentwurf: "• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF
    // 4'180". {description} und {price} kommen bereits mit ihrer
    // Umklammerung/ihrem Komma aus den Bausteinen unten, sonst bleiben sie
    // leer (kein doppeltes Leerzeichen oder Komma).
    itemLine: "• {category}: {name}{description}{price}",
    // Rückmeldung dÄHLer 14.10.2026: im Antwortentwurf stehen die
    // Positionen unter einer Bereichsüberschrift («Motor»), je Produkt eine
    // Zeile mit Strich; Bereiche ohne gewähltes Produkt mit categoryAdvice.
    itemLineGrouped: "- {name}{description}{price}",
    categoryAdvice: "Gerne beraten wir Sie persönlich zur passenden Lösung.",
    itemDescription: " ({description})",
    itemPrice: ", ab {price}",
    itemPriceInPreparation: ", in Vorbereitung",
    itemPriceOnRequest: ", auf Anfrage",
    itemsFallback: "Wir stellen Ihnen ein Paket nach Ihrem Wunsch zusammen.",
    performanceLine:
      "Mit {stage} kommt Ihr {model} auf {detail}, WLTP-geprüft und mit CH-Gutachten. Die Ergänzungsgarantie zur Werksgarantie ist für ein Jahr inbegriffen.",
    // Rückmeldung dÄHLer 14.10.2026 (Beispielmail): «inklusive Montage,
    // exklusive MFK», definitiver Preis nach Prüfung, mit Begründung.
    // {clarification} ist ein Genitiv-Anschluss an «nach Prüfung».
    priceLine:
      "Richtpreis für das Gesamtpaket: {price}, inklusive Montage, exklusive MFK. Der definitive Preis wird nach Prüfung {clarification} bestätigt. So stellen wir sicher, dass sämtliche Komponenten optimal aufeinander abgestimmt sind.",
    priceLineOnRequest:
      "Den Richtpreis nennen wir Ihnen nach kurzer Prüfung {clarification}, inklusive Montage, exklusive MFK. So stellen wir sicher, dass sämtliche Komponenten optimal aufeinander abgestimmt sind.",
    clarificationFahrwerk: "Ihres Serienfahrwerks (adaptives M-Fahrwerk ja oder nein)",
    clarificationMotorAuspuff: "der gewünschten Kombination aus Software-Leistungssteigerung und Abgasanlage",
    clarificationGeneric: "der gewünschten Ausführung",
    // Kein fest verdrahteter Text: Name kommt aus settings.signature_name,
    // {company} aus settings.mail_from_name plus optional settings.
    // company_address (nur wenn gesetzt) und Telefon aus settings.
    // signature_phone, siehe lib/draft/template.ts (auch die Namenszeile
    // "[Name]" aus der Vorschau). Prüfung Phase B, Punkt 6. Siehe
    // docs/architektur.md, Abschnitt Antwortentwurf.
    signature: "{name}\n{company} · {phone}",
  },
} as const;

// Die Struktur (Schlüssel, Verschachtelung) muss zwischen de und en exakt
// übereinstimmen, die konkreten Texte natürlich nicht. Deshalb wird der
// Typ aus de.ts hergeleitet, aber jede String-Literal-Art auf `string`
// verbreitert, damit en.ts eigene Texte verwenden kann.
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

export type Dictionary = Widen<typeof de>;
