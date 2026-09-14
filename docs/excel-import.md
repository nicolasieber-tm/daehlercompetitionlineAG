# Excel-Import: Struktur der Produktelisten und Parser-Regeln

Ergebnis der Analyse aller 42 Dateien in `docs/preislisten/` (Stand September 2026). Verbindlich für `lib/pricelist/parser.ts`. Vor Änderungen an den Regeln: Dateien anschauen, Regel hier nachführen.

## Dateien

- 42 Dateien, Format BIFF8 `.xls` (Excel 97-2003), je genau **ein Blatt** `Planung`. Der Parser muss `.xls` und `.xlsx` lesen (SheetJS `readFile`/`read` mit `{ raw: true }`, Zeilen via `sheet_to_json(ws, { header: 1, raw: true, defval: null })`).
- Eine Datei = eine **Baureihe** (`model_families`). Dateiname `Produkteliste <Baureihe>.xls` ist nur Fallback; der Name der Baureihe steht in **Zeile 2, Spalte B**.
- Marke: Name beginnt mit `MINI` → MINI, `TOYOTA` → Toyota, sonst BMW. Codes: alle Tokens im Namen, die auf `/^[EFGUR]\d{2,3}$/` oder `/^NA\d$/` passen (Kommas, Schrägstriche entfernen).

## Kopfzeilen

Zeile 1 (Index 0) enthält Spaltenbezeichnungen, Zeile 2 (Index 1) die Baureihe, die Preislisten-Nummer und die Motorisierungen. **Die Spaltenpositionen variieren je Datei**, deshalb ausschliesslich über die Bezeichnungen gehen:

| Was | Wo | Erkennung |
|---|---|---|
| Titel | Zeile 1, Spalte B | Text `dÄHLer Produkteliste` (Plausibilitätsprüfung, sonst Fehler «keine Produkteliste») |
| Baureihe | Zeile 2, Spalte B | Text, z. B. `M3 / M4 G80, G81, G82, G83` |
| Preislisten-Nr. | Zeile 2, Spalte unter `Nummer` | z. B. `46258` |
| RC | Spalte mit Zeile-1-Text `RC` | Buchstabe A bis F, N oder `-` (interne Klassifizierung, nur speichern) |
| Artikelnummer | Spalte mit Zeile-1-Text `Nummer` | Text, z. B. `12 97 480`, `18 61 F200`, `12 xx xxx` |
| Motorisierungen | alle Spalten zwischen `Nummer` und der ersten CHF-Spalte, in denen Zeile 2 einen Text hat und Zeile 1 **nicht** `AW`, `Lack`, `Montage`, `Teile`, `Komplettpreis`, `Teilepreis` ist | z. B. `20i`, `30i`, `M40i`, `18d`, `M3 Touring`, `Cooper S JCW`, `i5 M60`, `40 xDrive` |
| Doppelte Motorisierung | Gleicher Text in zwei Motorisierungsspalten (MINI F60: `Countryman One` unter Benzin und unter Diesel) | Beide Modelle bekommen den Kraftstoff als Zusatz: `Countryman One (Benzin)`, `Countryman One (Diesel)`; Slug entsprechend; Warnung. Modellnamen und Slugs sind je Familie eindeutig. |
| Kraftstoff-Gruppe | Zeile 1 über den Motorisierungsspalten: `Benzin`, `Diesel`, `Elektro` (vorwärts auffüllen bis zur nächsten Gruppe) | Eine Datei hat `Benzin                Diesel` in einer Zelle: dann ab dieser Spalte `benzin` und beim nächsten `Diesel`-Text `diesel`. Fehlt jede Gruppe (M-Modelle): `null`. |
| Preisspalten | die **vier** Spalten, in denen Zeile 2 `CHF` enthält, in dieser Reihenfolge: `price_parts` (Teilepreis), `price_install` (Montage / Lack), `price_approval` (Gutachten), `price_total` (Total inkl. MwSt.) | Genau 4 in allen 42 Dateien. Weniger oder mehr → Fehler mit Dateiname. |
| Interne Kalkulationsspalten | `AW`, `Lack`, `Montage`, `Teile`, `Komplettpreis` | **ignorieren**. In 9 Dateien fehlt `AW`. |

## Zeilenklassifizierung (ab Zeile 3)

Für jede Zeile: `name = trim(B) + (C vorhanden ? ' ' + trim(C) : '')` (Spalte C enthält selten einen Zusatz wie `inkl. V/max. Aufhebung`). `marks` = Menge der Motorisierungsspalten mit Wert `l` (Wingdings-Häkchen, in allen Dateien ausschliesslich `l`). `prices` = die vier Preiszellen.

Reihenfolge der Prüfung:

1. **Leer** (keine Zelle mit Inhalt): überspringen.
2. **Fusszeile**: nur die Total-Spalte hat Text (`Technische- sowie Preisänderungen vorbehalten`, `Kosten für die MFK-Eintragung ...`, `Frachtkosten ...`): überspringen.
3. **Kategorie**: nur Spalte B hat Inhalt und der Text entspricht (case-insensitiv, getrimmt) einem der Kategorienamen: `Motor`, `Auspuff`, `Fahrwerk`, `Räder`, `Karosserie`, `Cockpit/Interieur`, `Kraftübertragung`, `Bremse`, `Active-Sound System`. Setzt `source_category`, setzt `group_label = null`. Kategorien wiederholen sich in einer Datei (Seitenumbruch), das ist normal.
4. **Nur-Preise-Zeile**: kein `name`, aber mindestens eine Preiszelle gefüllt: die Preise gehören zum **vorherigen Produkt** (der Kunde hat die Zeile umbrochen, Beispiel M2 G87 `ECU-Abdeckung in Carbon`). Kommt 10-mal vor (eine davon mit Wert `0`, die ignoriert wird).
   Ergänzung 11.09.2026 (Prüfung Runde 4): bei den dÄHLer-Endrohre-Paaren in MINI F55/F56/F57 (Z39-50) und MINI F65/F66/F67 (Z32-43) steht die Total-Spalte eine Zeile zu tief: das «2 Endrohre»-Produkt hat keinen Total, das «4 Endrohre»-Produkt trägt in seiner Zeile den Total des Vorprodukts, und die Nur-Preise-Zeile darunter den eigentlichen Total des «4 Endrohre»-Produkts. Wörtlich angewendet ergäbe die Regel oben 4 falsche Preise je Datei. Deshalb: hat das vorherige Produkt bereits einen Total, der **nicht** seiner eigenen Summe Teile+Montage+Gutachten entspricht, aber **exakt** der Summe des davorliegenden Produkts (das noch keinen Total hat), wandert dieser Total zum davorliegenden Produkt und der Wert der Nur-Preise-Zeile zum vorherigen Produkt (Warnung «automatisch korrigiert»). In allen anderen Fällen überschreibt die Nur-Preise-Zeile den bestehenden Wert (Warnung). 8 Fälle, alle summenkonsistent.
5. **Produkt**: `name` vorhanden **und** (`price_total` numerisch **oder** `price_parts` gefüllt, numerisch oder Text). Alles andere mit Name ist kein Produkt.
   - `price_status`: `price_total` numerisch → `priced`. Sonst irgendeine Preiszelle enthält `vorb` (case-insensitiv) → `in_preparation`. Sonst → `on_request`. `price_note` = alle nicht-numerischen Preiszellen zusammengefügt (z. B. `in Vorb.`, `auf Anfr.`, `ab`, `inkl.`).

     Ergänzung 14.09.2026 (Prüfung Phase B, Punkt 8d): Ausnahme von «`price_total` numerisch → `priced`». Enthält die Teilepreis-Zelle (`price_parts`) Text mit `auf Anfr.` oder `inkl.` (case-insensitiv), während `price_total` trotzdem numerisch ist (der Total-Betrag ist dann nur eine Teilsumme, z. B. nur die Montagepauschale), gilt `price_status = on_request` statt `priced`. Beispiel (2er F22, F23.xls): `Heckflügel GTS in GFK`/`Heckflügel Carbon`, Teilepreis `auf Anfr.`, Montage 350, Total 350 → `on_request`, `price_note = 'auf Anfr.'`.
   - Numerische Preise: `Math.round` auf ganze Franken (Excel enthält Fliesskomma-Reste).
   - `fits`: `marks`. Wenn `marks` leer: `fits_all = true` (87 Produktzeilen haben keine Marker, meist Zubehör wie Distanzscheiben; im Admin sichtbar als «Fitment nicht angegeben»).
   - `group_label`: die zuletzt gesehene Gruppenzeile (Regel 6) innerhalb der aktuellen Kategorie.

     Ergänzung 14.09.2026 (Prüfung Phase B, Punkt 8a): Ausnahme für eine DME-/DDE-Gruppenzeile (Text beginnt mit `DME` oder `DDE`, siehe Regel 6). Sie gilt nur für Produkte mit `variant_group = 'leistung'` (die eigentlichen Leistungsstufen); für andere Produkte, die in der Excel danach in derselben Kategorie folgen (z. B. `Einbau Leistungssteigerung`, reine Montagepauschale, siehe `lib/catalog/variant-groups.ts`, oder ein nicht als Leistungsstufe erkanntes Zubehör wie `Carbon Air Intake`), bleibt `group_label = null`, auch wenn die DME-/DDE-Zeile noch «aktiv» ist. Alle anderen Gruppenzeilen (Distanzscheiben, dÄHLer Endrohre, Radsätze, ...) gelten weiterhin für ALLE nachfolgenden Produkte der Kategorie bis zur nächsten Gruppenzeile/Kategorie, unverändert.
   - Leistungsdaten aus dem Namen, alle optional (`null` wenn nicht erkannt):
     - `ps_base`: Zahlen in `(Basis ... PS)`, auch `(Basis 600/625 PS)`, `(Basis S63 600/625 PS)`, `(Basis 306/340PS)` → `[600, 625]`.
     - `ps_to` / `nm_to`: Muster `<Zahl> PS / <Zahl> Nm` mit optionalem Apostroph in der Zahl (`1'130 Nm`), auch `380PS/520Nm` ohne Leerzeichen, auch `PS/780 Nm`. Das erste Vorkommen, das **nicht** innerhalb der Basis-Klammer steht. `540*` → 540.
     - Beispiele, die funktionieren müssen: `Stufe 1: (Basis 460 PS) 590PS / 720Nm (M...`, `(Basis 374 PS) Stufe 2: 455 PS / 640 Nm B58 ab 11/2020`, `Leistungssteigerung Stufe 1 (380PS/520Nm) mit Vmax-Aufhebung`, `Stufe 1: (Basis 727 PS) 830 PS / 1'130 Nm, S68`, `(Basis 489 / 653 PS) Stufe 1: 753 PS/900 Nm S68`. Muss `null` liefern für `(Basis 381 PS) Stufe 1: PS /  Nm B58` (leere Zahlen).

       Ergänzung 14.09.2026 (Prüfung Phase B, Punkt 8c): `nm_to` kann statt einer einzelnen Zahl als Bereich `<Zahl> - <Zahl> Nm` vorkommen (echte Zeile, 5er F10, F11.xls: `(Basis 306 PS) 360 PS / 480 - 530 Nm N55`) - dann gilt die OBERE Zahl des Bereichs als `nm_to` (im Beispiel 530, nicht 480), `ps_to` bleibt unverändert die Zahl vor `PS` (im Beispiel 360).
   - `variant_group` aus `lib/catalog/variant-groups.ts` (Regex je Kategorie, siehe unten).
   - `content_hash` = sha1 über `category|name|description|article_no|price_parts|price_install|price_approval|price_total|price_status|sortierte fits`. Der Hash ist **nicht eindeutig** je Familie (z. B. `Adaptersatz inkl. Radschrauben und Nabenkappen` kommt je Radsatz vor, 17 Kollisionen in 9 Familien); er dient dem Diff, nicht als Schlüssel.
5b. **Produkt ohne Preisangabe**: `name` vorhanden, keine Preiszelle gefüllt, aber eine Artikelnummer, die nicht `77` oder `777` ist (Beispiele MINI F60: `Adaptersatz inkl. Radschrauben und Nabenkappen` mit `36 F60 xxx`, `Edelstahlauspuffanlage` mit `18 xxx`): Produkt mit `price_status = on_request`, `price_note = 'ohne Preisangabe'`, Warnung. Zeilen mit Nummer `77` (Gutachten) oder `777` (Garantie) ohne Preis sind Hinweise (Regel 8).
6. **Gruppenzeile**: `name` endet mit `:` und kein Preis → `group_label` für die folgenden Produkte (z. B. `DME Leistungssteigerungen:`, `DDE Leistungssteigerungen Dieselmotoren:`, `Distanzscheiben (schwarz) Satz i.V. mit ...`, `dÄHLer Endrohre satin oder schwarz matt Keramik beschichtet`). Hinweis: die beiden letzten enden nicht mit Doppelpunkt, sind aber Gruppenzeilen. Zusatzregel: Zeile ohne Preis, ohne RC, ohne Marker, **direkt nach einer Kategoriezeile oder nach einem Produkt**, deren Text mit `dÄHLer Endrohre` oder `Distanzscheiben` beginnt, ist ebenfalls Gruppenzeile. Weitere Gruppenzeilen ohne Doppelpunkt: Text beginnt mit `DME` oder `DDE` (Toyota: `DME Leistungssteigerungen «powered by dÄHLer»`), oder die Zeile steht **direkt nach einer Kategoriezeile** und hat weder RC noch Artikelnummer noch Marker noch Preis (Werte in den internen Kalkulationsspalten sind egal). Die Sonderregel «Text beginnt mit dÄHLer Endrohre / Distanzscheiben» gilt, sobald die vorherige Zeile eine Kategorie, ein Produkt (auch eines nach Regel 5b) oder ein Hinweis ist.

   Ergänzung 14.09.2026 (Prüfung Phase B, Punkt 8b): weitere Variante der Sonderregel «Text beginnt mit dÄHLer Endrohre / Distanzscheiben». Eine solche Zeile ohne RC, ohne Artikelnummer, ohne Marker gilt auch dann als Gruppenzeile, wenn sie zwar EINE gefüllte Preiszelle hat, diese aber Text statt einer Zahl enthält (z. B. `in Vorb.`); wörtlich nach den obigen Regeln wäre sie sonst (über Regel 5, wegen der gefüllten Preiszelle) fälschlich ein Produkt ohne echten Preis. Echte Zeile (XM G09.xls, Zeile 59): `Distanzscheiben (schwarz) Satz i.V. mit BMW Serien- od. M Performance Räder`, einzige Preiszelle `in Vorb.` → Gruppenzeile statt Produkt, mit Warnung.
   Ausserdem: Zeilen wie `CDC1 FORGED Radsatz geschmiedet bestehend aus:` haben einen Preis und sind deshalb **Produkte** (Regel 5 gewinnt), die folgenden Reifengrössen sind Beschreibung (Regel 7). **Eine Zeile, die auf `:` endet, ist nie eine Fortsetzung**: `CDC1 Radsatz bestehend aus:` ohne Preis nach einem anderen Radsatz ist eine neue Gruppenzeile (Regel 6), nicht Beschreibung des Vorprodukts. Es gibt keine Sonderbehandlung für «bestehend aus»-Produkte über Regel 7 hinaus.

   Ergänzung 14.09.2026 (Prüfung Runde 5, Befund 1): Ausnahme von der vorigen Aussage. In einer Minderheit der Radsatz-Blöcke (X3 G01/X4 G02, X5 G05/X6 G06, X5M F95 LCI/X6M F96 LCI, X7 G07, XM G09; 15 Vorkommen) fehlt der Preis ausnahmsweise auf der `... Radsatz ... bestehend aus:`-Zeile selbst und steht stattdessen auf der folgenden Dimensionszeile (`9 x 20" mit 245/45 20` o. ä., beginnt mit einer Ziffer); RC/Artikelnummer/Marker sind dabei mal auf der einen, mal auf der anderen Zeile verteilt. Wörtlich nach der Regel oben würde die `bestehend aus:`-Zeile mangels Preis zur Gruppenzeile (Regel 6), die Dimensionszeile fälschlich zum Produkt (Name nur die Dimension statt des Radsatznamens) und `group_label` bliebe mangels Reset an allen nachfolgenden Zubehör-Produkten der Kategorie hängen (Adaptersatz, Aufpreis Lackierung, RDCi-Sensoren, Mobility-System, bei XM G09 auch Distanzscheiben). Deshalb: passt eine preislose Zeile auf `/Radsatz.*bestehend aus:$/i` und trägt die unmittelbar folgende, mit einer Ziffer beginnende Zeile einen Preis, wird die `bestehend aus:`-Zeile selbst zum Produkt (Name), RC/Artikelnummer/Marker/Preis werden aus beiden Zeilen zusammengeführt (je die gefüllte Zelle gewinnt, der Preis kommt zwingend von der Dimensionszeile), die Dimensionszeile wird zur ersten Beschreibungszeile (weitere Grössen wie gewohnt über Regel 7). `group_label` bleibt dabei unverändert, wird also **nicht** auf diese Zeile gesetzt.
7. **Fortsetzung**: kein Preis, keine RC, keine Artikelnummer, keine Marker, und die vorherige klassifizierte Zeile ist ein Produkt → an dieses Produkt anhängen:
   - in den **Namen**, wenn der bisherige Name auf `inkl.`, `mit`, `und`, `für`, `-`, `/`, `,` endet oder die Fortsetzung mit einem Kleinbuchstaben beginnt (Beispiel `Für viele Modelle ist auch eine DME/DDE Programmierung inkl.` + `V/max. Aufhebung im Angebot`);
   - sonst in die **Beschreibung** (Zeilenumbruch-getrennt; Beispiel Radsätze: `10 x 20" mit 275/30 20` / `10 x 20" mit 285/30 20`).
   - Trennstrich-Umbruch (gilt für Namen, Beschreibungen und Hinweise): endet der bisherige Text auf `-` und beginnt die Fortsetzung mit einem Kleinbuchstaben, wird ohne Leerzeichen zusammengefügt und der Trennstrich entfernt (`Leistungs-` + `steigerungen` → `Leistungssteigerungen`, `Typen-` + `genehmigungsnummer` → `Typengenehmigungsnummer`).
8. **Hinweis**: Alles andere mit Name (kein Preis, nicht Regel 6 oder 7), z. B. `Ein DTC- / CH- Gutachten ist für alle Leistungs-` (RC A, Nummer 77, ohne Total) oder `Eine Ergänzungsgarantie zur Werksgarantie für 1 Jahr ist` (RC N, Nummer 777). Folgende Zeilen ohne RC/Marker/Preis hängen an den Hinweis an (Regel 7 greift nicht, weil die vorherige Zeile kein Produkt ist). Hinweise werden je `(family, source_category)` in `pricelist_notes` gespeichert, Reihenfolge = Zeile.

Verwaiste Marker-Zeilen (kein Name, kein Preis, nur Marker, evtl. RC oder Artikelnummer `.`; 10 Fälle): **ignorieren und Warnung** mit Zeilennummer erzeugen. Keine stille Fitment-Erweiterung des Vorprodukts. Ausnahme: Zeile hat einen Namen, der exakt dem Vorprodukt entspricht, keinen Preis und Marker → dann sind es zusätzliche Fitments des Vorprodukts (Warnung trotzdem).

Preiswert `0` in einer CHF-Spalte gilt als «kein Preis» (Datenfehler, Warnung).

Sonderfälle, die geprüft werden müssen:
- Gleicher Produktname mehrfach in einer Kategorie mit unterschiedlichen Markern/Preisen (z. B. `Sportfahrwerk höhenverstellbar` für 20i/30i und separat für M40i): beides sind eigene Produkte, unterschieden über `source_row`, `article_no`, Fitment.
- Zeilen mit numerischen Werten in den internen Kalkulationsspalten, aber ohne CHF-Preise (z. B. `DME Leistungssteigerungen:` mit `4849.02` in `Teile`/`Komplettpreis`): kein Produkt, Regel 6.
- Sortierung: `sort` = laufende Nummer der Produktzeile innerhalb der Datei.

## Kategorie-Mapping (Excel → Flow)

In `lib/catalog/categories.ts`:

| Excel `source_category` | Flow `category` |
|---|---|
| Motor | motor |
| Kraftübertragung | motor (Block «Kraftübertragung» im Motor-Schritt) |
| Auspuff | auspuff |
| Active-Sound System | auspuff (Block «Active-Sound») |
| Fahrwerk | fahrwerk |
| Bremse | fahrwerk (Block «Bremse») |
| Räder | raeder |
| Karosserie | exterieur |
| Cockpit/Interieur | interieur |

Im Kategorie-Schritt werden Produkte nach `source_category` und darunter nach `group_label` gruppiert dargestellt, damit Bremse und Kraftübertragung sichtbar bleiben.

## Varianten-Gruppen (`lib/catalog/variant-groups.ts`)

Regex auf den Namen, je Flow-Kategorie. Treffer → `variant_group`, sonst `null` (kombinierbar):

- motor: `/\(Basis|Stufe\s*\d|Leistungssteigerung/i` → `leistung`, ausser der Name passt auf `/^Einbau\b|i\.V\.\s*mit\s+Leistungssteigerung/i` (Ergänzung 14.09.2026, Prüfung Runde 5, Befund 2): `Einbau Leistungssteigerung` (17 Familien, reine Montagepauschale CHF 330 zu einer an anderer Stelle gewählten Stufe, kein eigenes Leistungsprodukt) und `Anhebung der serienmässigen V/max. Begr. auf 327km/h i.V. mit Leistungssteigerung` (M5 F10/M6 F06, ausdrücklich in Verbindung mit einer Stufe gekauft) sind sonst fälschlich exklusiv zu Stufe 1/Stufe 2 (Auswahl der Stufe wählt beim Zusatz ab oder umgekehrt, PS-Zähler zeigt bei `Einbau Leistungssteigerung` `null`). Bewusst **nicht** ausgenommen: `Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung` (M2 F87, M3/M4 G80) - Exklusivität zu einer Stufe ist hier vertretbar.
- auspuff: zuerst `/Komplettanlage|Endschalld|Nachschalld|Auspuffanlage/i` → `anlage`, erst danach `/Endrohre/i` → `endrohre` (Reihenfolge ist wichtig: «Komplettanlage HP ... ohne Endrohre» ist eine Anlage, keine Endrohre)
- fahrwerk: `/Sportfeder|Sportfahrwerk|Gewindefahrwerk|Performance Fahrwerk|Race Fahrwerk/i` → `fahrwerk`
- raeder: `/Radsatz/i` → `radsatz`

## Ausgabe des Parsers (`lib/pricelist/types.ts`)

```ts
type ParsedFamily = {
  name: string; slug: string; brand: 'BMW'|'MINI'|'Toyota'; codes: string[]; pricelistNo: string|null; sourceFile: string;
  models: { name: string; slug: string; fuel: 'benzin'|'diesel'|'elektro'|null; sort: number; seriesPsSuggested: number[] }[];
  products: { sourceRow: number; sort: number; sourceCategory: string; category: FlowCategory; groupLabel: string|null;
    name: string; description: string|null; articleNo: string|null; rc: string|null;
    pricePartsChf: number|null; priceInstallChf: number|null; priceApprovalChf: number|null; priceTotalChf: number|null;
    priceStatus: 'priced'|'in_preparation'|'on_request'; priceNote: string|null;
    psBase: number[]; psTo: number|null; nmTo: number|null; variantGroup: string|null;
    fits: string[]; fitsAll: boolean; contentHash: string }[];
  notes: { sourceCategory: string; text: string; sort: number }[];
  warnings: string[];   // z. B. «Zeile 45: Produkt ohne Marker», «Zeile 23: Preis 'ab' nicht numerisch»
}
```

`seriesPsSuggested` je Modell = sortierte, eindeutige `psBase`-Werte aller Leistungsprodukte (`variantGroup === 'leistung'`), die dieses Modell fitten.

## Erwartete Kennzahlen (zur Verifikation)

- 42 Familien. Verifizierte Zahlen (Parser-Stand 14.09.2026, unabhängig gegen die Rohdaten geprüft): ca. 2'380 Produkte `priced`, ca. 116 `in_preparation`, 10 Nur-Preise-Zeilen, ca. 85 Produkte ohne Marker. Toleranz ±3 %. (Frühere Zahlen 2'420 / 166 / 87 stammten aus einer naiven Volltextsuche, die Fusszeilen und Hinweise mitzählte.)
- Korrektur 11.09.2026 (Behebung Regression Befund #1): der Wert "ohne Marker" wurde hier zuvor mit "ca. 70" angegeben. Das war nach Entfernen der «bestehend aus:»-Sonderregel nicht mehr zutreffend: 17 Zeilen (z. B. «Adaptersatz inkl. Radschrauben und Nabenkappen» ohne Marker, MINI F60 «Edelstahlauspuffanlage»/«Komplettanlage») wurden zuvor stillschweigend in die Beschreibung des vorherigen Radsatz-Produkts gehängt statt als eigenes Produkt gezählt; nach Regel 5b sind sie eigene `on_request`-Produkte ohne Marker (71 + 17 = 88), Zeile für Zeile gegen die Rohdaten geprüft (siehe `npm run parse`-Tabelle im Bericht).
- Korrektur 14.09.2026 (Prüfung Phase B, Punkt 8b): der Wert "ohne Marker" sinkt von 88 auf 85. Die XM G09.xls-Zeile «Distanzscheiben (schwarz) Satz i.V. mit BMW Serien- od. M Performance Räder» (marker- und preislos, einzige Preiszelle Text `in Vorb.`) wurde vor dieser Korrektur nicht als eigenständiges, marker-loses Produkt gezählt (sondern je nach Spaltenlage der Textzelle als Hinweis oder als Produkt mit anderem Status), zählt jetzt korrekt als Gruppenzeile (siehe Regel 6, Ergänzung 14.09.2026 Punkt 8b) - per `npm run parse` gegengeprüft (Total-Zeile "o.Marker" 85).
- M2 G87: Modelle `M2`, `M2 CS`; erstes Motorprodukt `Stufe 1: (Basis 460 PS) 590PS / 720Nm ...` mit Total 4180, Fitment nur `M2`; `Carbon Air Intake` Total 4320; `CDC2 FORGED Radsatz ... 21` Total 8980 mit Beschreibung `9.5 x 21" mit 275/25 21` / `10.5 x 21" mit 295/25 21`; `Spurstange HA einstellbar` → `in_preparation`.
- 3er G20, G21: 7 Modelle (`20i`, `30i`, `M40i`, `18d`, `20d`, `30d`, `M40d`), `20i/30i/M40i` = benzin, Rest diesel; `Sportfedersatz -25mm 318i-320d` fittet `20i, 30i, 18d, 20d`, Total 1490.
- Preise stimmen mit den PDF-Preislisten auf daehler.com überein (Stichprobe M2 G87 in der Vorschau: Stufe 1 4180, Stufe 2 8390, Komplettanlage 5260).
