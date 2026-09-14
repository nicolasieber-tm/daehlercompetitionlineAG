// Follow-up-Mail (Posten 6, siehe CLAUDE.md und docs/architektur.md,
// Abschnitt "Follow-ups"). Betreff und Text kommen aus der konfigurierten
// Regel (follow_up_rules), nicht aus lib/draft: {{vorname}}, {{name}},
// {{fahrzeug}}, {{nummer}} werden ersetzt, danach die Signatur aus settings
// angehängt (draft.signature-Muster, siehe lib/i18n/de.ts).
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import { renderTemplate } from "@/lib/followups/placeholders";
import type { KnownFollowUpPlaceholder } from "@/lib/followups/placeholders";
import type { MailFollowUpContext } from "../types";
import { companyLine, paragraphs, renderMail } from "../render";

/**
 * Ersetzt die vier bekannten Platzhalter über renderTemplate()
 * (lib/followups/placeholders.ts) statt einer eigenen, zweiten Ersetzung
 * (Prüfung Phase B, Punkt 3: bisher hier eine eigene fillPlaceholders(),
 * die unbekannte Platzhalter unverändert als "{{...}}" stehen liess -
 * direkt so an den Kunden verschickt). Für den tatsächlichen Versand ist
 * das anders als bei der Admin-Vorschau/-Validierung beim Speichern einer
 * Regel (ausserhalb der mir zugewiesenen Dateien, nutzt laut
 * Aufgabenstellung ebenfalls renderTemplate()s unknownPlaceholders, um
 * einen Speicherfehler zu melden) nicht akzeptabel: ein Tippfehler wie
 * "{{modell}}" landet sonst roh im Fliesstext beim Kunden. Deshalb werden
 * unbekannte Platzhalter hier zusätzlich geleert und als Warnung geloggt.
 */
function fillTemplate(
  template: string,
  vars: Partial<Record<KnownFollowUpPlaceholder, string>>,
  label: "Betreff" | "Text",
): string {
  const { text, unknownPlaceholders } = renderTemplate(template, vars);
  let result = text;
  if (unknownPlaceholders.length > 0) {
    console.warn(
      `buildFollowUp: unbekannte Platzhalter im Follow-up-${label} geleert: ${unknownPlaceholders.join(", ")}`,
    );
    for (const placeholder of unknownPlaceholders) {
      result = result.split(placeholder).join("");
    }
  }
  // Ein leerer Vorname (inquiries.first_name null -> "") ersetzt
  // "{{vorname}}" korrekt mit "", hinterlässt in einer Anrede wie "Guten
  // Tag {{vorname}} {{name}}" aber ein doppeltes Leerzeichen ("Guten Tag
  // Muster" statt "Guten Tag  Muster") - Kundentexte ohne Doppelleerzeichen
  // (CLAUDE.md, Abschnitt "Arbeitsweise").
  return result.replace(/ {2,}/g, " ");
}

export function buildFollowUp(ctx: MailFollowUpContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const vars: Partial<Record<KnownFollowUpPlaceholder, string>> = {
    vorname: ctx.inquiry.first_name ?? "",
    name: ctx.inquiry.last_name ?? "",
    fahrzeug: ctx.vehicleLabel,
    nummer: ctx.inquiry.number,
  };

  const subject = fillTemplate(ctx.rule.subject, vars, "Betreff");
  const body = fillTemplate(ctx.rule.body, vars, "Text");
  // Prüfung Phase B, Punkt 6: Firmenname aus settings.mail_from_name
  // (ctx.settings.companyName), die Adresse (companyAddress) wird nur
  // angehängt, wenn gesetzt (docs/vorschau.html draft(): die Signatur zeigt
  // dort ohne Adresse nur "dÄHLer Competition Line AG · Telefon"). Über
  // companyLine() (lib/mail/render.ts), damit companyName nicht doppelt
  // erscheint, wenn companyAddress ihn (wie der ausgelieferte Seed-Wert)
  // bereits selbst enthält - Befund «polish» #1.
  const company = companyLine(ctx.settings.companyName, ctx.settings.companyAddress);
  const signature = tf(dict.draft.signature, {
    name: ctx.settings.signatureName,
    company,
    phone: ctx.settings.signaturePhone,
  });

  const blocks = [...paragraphs(body), ...paragraphs(signature)];

  const { html, text } = renderMail({ blocks });
  return { subject, html, text };
}
