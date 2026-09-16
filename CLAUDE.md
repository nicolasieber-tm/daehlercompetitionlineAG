# dÄHLer Anfrage-Erlebnis

Produktives Anfragetool für dÄHLer Competition Line AG (daehler.com, Belp BE). Ersetzt das Kontaktformular durch einen geführten Ablauf, der bei dÄHLer als strukturierte Anfrage mit Antwortentwurf eintrifft. Auftrag gemäss Offerte 2026-091, Posten 1 bis 6.

Dieses Dokument ist verbindlich. Es hält die Entscheidungen aus den Kundengesprächen fest, die nirgends im Code stehen. Bei Widerspruch zwischen Code und diesem Dokument gilt das Dokument. Bei Unklarheit: fragen, nicht raten.

## Referenzen im Repo

- `docs/Offerte_2026-091.pdf`: Leistungsumfang je Posten. Das ist das Pflichtenheft.
- `docs/vorschau.html`: Die Vorschau, die der Kunde gesehen und bestätigt hat. UI-Referenz für Look, Ablauf, Texte, «Passt gut dazu»-Logik, Vorher/Nachher-Screen, interne Ansicht. Nicht als Codebasis übernehmen (Daten und Bilder sind eingebettet, kein Backend), aber Struktur und Verhalten des Flows sind abgenommen.
- `docs/preisliste.xlsx`: Die Excel-Preisliste des Kunden. Einzige Quelle für Modelle, Produkte, Preise, technische Daten.
- `docs/produktelisten/*.pdf`: Die veröffentlichten PDF-Preislisten von daehler.com. Nur zum Gegenprüfen des Excel-Imports, nie als Datenquelle.

## Kunde und Kontext

- dÄHLer veredelt BMW (Schwerpunkt), MINI, Toyota, Wiesmann. Motor, Auspuff, Fahrwerk, Räder, Exterieur, Interieur.
- 8 bis 10 Anfragen pro Tag über das heutige Kontaktformular. Anfragen gehen an info@daehler.com.
- Ansprechpartner: Christoph Dähler. Er beantwortet Anfragen selbst.
- Preislisten werden alle drei Monate aktualisiert. Intern als Excel, öffentlich als PDF pro Modellfamilie.
- Website: WordPress mit Elementor. Wir haben Admin-Zugang. Brand: Rot #E21014, Dunkelgrau #181D1E, Weiss. Logo-Schreibweise «dÄHLer».

## Entscheidungen (verbindlich)

**Ansprache:** Sie-Form gegenüber Endkunden. Überall: Flow, Mails, Antwortentwurf. Die Vorschau ist per Du, das wird umgestellt.

**Sprache:** Deutsch. Englisch ist Posten 4 (Sprachumschaltung im Tool). Kein Französisch.

**Datenquelle:** Die Excel-Preisliste ist die einzige Quelle für Modelle, Produkte, Preise und technische Daten. Es gibt keine manuelle Pflege von Produkten oder Preisen im Admin. Neue Einträge in der Excel erscheinen nach dem Upload automatisch im Flow, entfernte verschwinden. Der Admin pflegt ausschliesslich: Modellfotos, optionaler Kurzbeschrieb pro Modell, Serien-PS/Nm falls nicht in der Excel.

**Modelle ohne Preisliste:** Ältere Fahrzeuge (F- und E-Serie) und Modelle, für die keine Excel-Daten existieren, laufen über einen verkürzten Ablauf «auf Anfrage»: Fahrzeug, Kategorien, Charakter, Kontakt. Keine Produktauswahl, keine Preise, keine Paketsumme.

**Preise sichtbar:** Der Kunde sieht Richtpreise «ab CHF» pro Option und eine Richtsumme am Schluss, immer mit «unverbindlich, Kompatibilität wird geprüft». Preise inkl. Einbau, exkl. MFK, so wie in den PDFs.

**Kein Roding.** Marken: BMW, MINI, Toyota, Wiesmann.

**Mailversand:** Über Resend, ab einer Adresse auf daehler.com (SPF/DKIM beim Domain-Hoster des Kunden). Jede ausgehende Mail an einen Kunden geht als Kopie (BCC) an info@daehler.com. Reply-To ist info@daehler.com. Anfragen selbst gehen an info@daehler.com.

**Antwortentwurf:** Wird im Admin bearbeitet und von dort gesendet. Daneben ein «Kopieren»-Button für den Fall, dass er in Outlook weiterschreiben will. Nichts geht automatisch an Kunden raus, ausser der Eingangsbestätigung und den Follow-ups (Posten 6), die er selbst konfiguriert.

**Follow-ups (Posten 6):** Regelbasiert, Frist und Text konfigurierbar. Stopp ausschliesslich manuell: der Kunde klickt im Admin auf «Antwort erhalten». Keine Anbindung an sein Postfach, kein automatisches Erkennen von Antworten.

**Kompatibilität:** Wird nicht automatisch geprüft. Das Tool erzeugt Prüfhinweise (siehe unten), die Prüfung macht dÄHLer.

**Website-Texte:** Werden nicht automatisch von daehler.com geholt. Kurzbeschriebe fügt der Kunde im Admin ein, aus seinen Pressetexten.

**Nicht im Umfang:** CRM, Lagerbewirtschaftung, automatische Kompatibilitätsprüfung, vollautomatische Angebote ohne Prüfung, FAQ, Übersetzung der bestehenden Website (Posten 5 ist ein separates WordPress-Plugin-Thema, nicht Teil dieser App).

## Architektur

- Eigenständige App unter einer Subdomain, Vorschlag `anfrage.daehler.com`. Kein WordPress-Plugin, kein Embed. WordPress bekommt nur zwei Buttons (Navigation, Hero) und der Google-Unternehmensprofil-Button verlinkt auf dieselbe URL.
- Stack: Next.js (App Router), Tailwind, Supabase (Postgres, Auth, Storage für Fotos), Resend, Railway. Optional Anthropic API für Posten 3. Entscheid 16.09.2026: Supabase durch Railway Postgres, better-auth und Fotos in Postgres ersetzt, siehe docs/umbau-railway.md.
- Admin unter `/admin`, geschützt via Login (seit 16.09.2026 better-auth mit E-Mail und Passwort statt Supabase Auth). Ein Benutzer für dÄHLer, einer für Trending Media.
- Mobile first. Die meisten Kunden kommen vom Handy.

## Datenmodell (Richtung, Details aus der Excel ableiten)

- `models`: id, brand, name (z.B. «M3 Touring»), code (z.B. «G81»), series_ps, series_nm, photo_url, short_text, has_pricelist (bool), active
- `products`: id, model_id, category (motor | auspuff | fahrwerk | raeder | exterieur | interieur), name, description, price_from, variant_group (nullable: Optionen derselben Gruppe schliessen sich aus, z.B. Stufe 1 / Stufe 2), sort, source_row
- `pricelist_imports`: id, uploaded_at, filename, summary (json: neu, geändert, entfernt), status
- `inquiries`: id, number (z.B. 2026-0912), created_at, status (neu | in_bearbeitung | beantwortet | abgeschlossen), model_id, year, categories[], selections (json), follow_up_answers (json), character, timing, first_name, last_name, city, phone, email, channel, message, estimated_total, checks[] (Prüfhinweise), draft_reply, replied_at, answer_received_at
- `outbound_emails`: id, inquiry_id, type (confirmation | reply | follow_up), sent_at, resend_id
- `follow_up_rules`: id, days_after_reply, template, max_count, active

Die Excel-Struktur zuerst analysieren, bevor das Modell festgezurrt wird. Bekannt aus den PDFs: pro Modell mehrere Stufe-1-Varianten je nach Serienbasis-PS, Fahrwerksvarianten je nach xDrive/Cabrio, teils «in Vorbereitung» ohne Preis. Das Modell muss das abbilden können.

## Excel-Import

- Upload im Admin. Parser liest die Excel, erzeugt einen Diff gegen den Bestand (neue Modelle, neue Produkte, Preisänderungen, entfernte Produkte) und zeigt ihn an, bevor übernommen wird.
- Neues Modell ohne Foto: wird angelegt, im Admin mit «Foto fehlt» markiert, im Flow trotzdem sichtbar.
- Wenn die Excel-Struktur nicht stabil genug ist (mehrere Blätter mit unterschiedlichem Layout), mit dem Kunden eine feste Vorlage definieren, ein Blatt, feste Spalten. Das vor dem Parser-Bau klären.
- Erstbefüllung: einmalig aus der gelieferten Excel, Stichproben gegen die PDFs.

## Kundenflow (siehe vorschau.html)

1. Fahrzeug: Marke, Modell (Kacheln mit Foto), Baujahr, «schon mal bei uns gewesen». Serien-PS/Nm anzeigen.
2. Wunsch: Kategorien als Foto-Kacheln, Mehrfachauswahl, plus «Komplettpaket, beraten Sie mich».
3. Pro gewählter Kategorie ein Schritt: Optionen aus `products`, Varianten exklusiv, Ergänzungen kombinierbar, «ab CHF». Folgefrage je Kategorie (Motor: Leistung/Sound/beides; Auspuff: Lautstärke; Fahrwerk: Einsatz; Räder: Oberfläche). Beim Motor der PS-Zähler «Serie → mit Stufe X». «Passt gut dazu»-Vorschlag für eine nicht gewählte Kategorie, ein Klick fügt sie als nächsten Schritt ein.
4. Charakter: Dezent / Sportlich / Maximum. Optionales Freitextfeld.
5. Termin (Zeitraum-Chips) und Kontakt (Vorname, Name, Ort, Telefon, E-Mail, bevorzugter Kanal). Datenschutz-Hinweis.
6. Abschluss: Foto, Vorher/Nachher-Tabelle, «Paket als Link teilen» (echter Link auf eine read-only Ansicht der Anfrage), «Zusammenfassung an mich senden», Paket mit Richtsumme, nächste Schritte.

Bei Absenden: Anfrage speichern, Bestätigungsmail an Kunden, Anfrage-Mail an info@daehler.com mit strukturierter Zusammenfassung, Prüfhinweisen und Antwortentwurf, Link in den Admin.

## Prüfhinweise (regelbasiert, erweiterbar)

- Motor und Auspuff gewählt: Kompatibilität Abgasanlage und Motorsoftware
- Stufe 2 ohne Hochleistungskats: Hinweis
- Stufe «in Vorbereitung» gewählt: Zeithorizont nennen
- Fahrwerk: Serienfahrwerk adaptiv? Einbausatz nötig?
- Räder: Reifendimension, Distanzscheiben, Wunschfarbe
- Exterieur: Carbon oder lackiert, Lackcode
- Baujahr «älter»: Homologation je Motorvariante
- Charakter Maximum mit Stufe 1: Stufe 2 anbieten
- Kurzer Zeitraum gewünscht: Werkstattkapazität prüfen

Regeln in einer Datei, nicht im UI-Code verstreut. Der Kunde wird weitere liefern.

## Antwortentwurf

Vorlage per Sie, Tonalität dÄHLer (sachlich, technisch präzise, herzlich). Struktur: Dank, Bestätigung was machbar ist, Positionen mit Preisen, Leistungsangabe bei Motor, Richtpreis mit Vorbehalt, Terminaussage, Abschluss, Signatur mit Telefon. Referenz in vorschau.html, Funktion `draft()`.

## Admin

- Übersicht aller Anfragen mit Status, Suche, Filter nach Modell und Zeitraum.
- Detailansicht: Zusammenfassung, Prüfhinweise, Antwortentwurf bearbeiten, «Senden» (via Resend, BCC info@), «Kopieren», Status setzen, «Antwort erhalten».
- Preislisten-Upload mit Diff.
- Modelle: Foto hochladen/ersetzen, Kurzbeschrieb, Serien-PS/Nm.
- Follow-up-Regeln (Posten 6).
- Schnellweg (Posten 3): Textfeld, «Auswerten», Ergebnis wie eine Tool-Anfrage, Antwortentwurf, Senden/Kopieren.

## Posten 3, Schnellweg

Freitext (Mail oder Telefonnotiz) wird mit einem Sprachmodell in Fahrzeug, Kategorien, Wunsch, Ziel, Termin und Kontakt zerlegt, gegen `models` und `products` gematcht, dann derselbe Antwortentwurf wie bei einer Tool-Anfrage. Unsichere Zuordnungen markieren, nicht raten. Der Kunde prüft immer. Zwei, drei Pressetexte von daehler.com als Stilvorlage für die Tonalität hinterlegen.

## Reihenfolge

1. Excel analysieren, Datenmodell, Import mit Diff, Erstbefüllung, Stichproben gegen PDFs. Ergebnis dem Kunden zeigen.
2. Backend, Anfrage speichern, Mails (Resend, Domain-Setup parallel anstossen).
3. Frontend-Flow aus der Vorschau übernehmen, an DB hängen, Sie-Form, alle Modelle, verkürzter Flow.
4. Admin.
5. WordPress-Buttons, Google-Button, Ablösung Kontaktformular, Livegang.
6. Posten 3, Posten 6.

## Arbeitsweise

- Vor jeder Annahme über die Excel-Struktur: die Datei anschauen.
- Preise nie von Hand im Code oder in der DB ändern. Nur über Import.
- Texte gegenüber Kunden: Sie-Form, Schweizer Schreibweise (ss statt ß), «Grüsse», Preise mit Apostroph als Tausendertrennzeichen: CHF 4'180.
- Keine Gedankenstriche in Kundentexten, Kommas oder Punkte verwenden.
- Alles, was der Kunde später selbst pflegen soll, gehört in den Admin, nicht in Config-Dateien.
- Nichts geht automatisch an Endkunden raus, ausser Eingangsbestätigung und konfigurierten Follow-ups.
