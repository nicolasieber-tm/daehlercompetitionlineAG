import { admin } from "@/lib/i18n/admin";
import { de } from "@/lib/i18n/de";
import { optionLabel } from "@/lib/mail/render";
import type { MailInquiryContext } from "@/lib/mail/types";
import { Card } from "./Card";

/** Kunde: mailto/tel-Links (Aufgabenstellung), Kanal, Neu-/Bestandskunde. */
export function CustomerCard({ ctx }: { ctx: MailInquiryContext }) {
  const { inquiry } = ctx;
  const name = [inquiry.first_name, inquiry.last_name].filter(Boolean).join(" ");
  const channel = optionLabel(de.steps.contact.channels, inquiry.channel);

  return (
    <Card title={admin.detail.customer.title}>
      {/* grid-cols-[auto_minmax(0,1fr)]: ohne minmax(0,...) bleibt die
          Wert-Spalte auf ihre min-content-Breite begrenzt (CSS-Grid-Default) -
          eine lange E-Mail-Adresse im mailto-Link (kein Umbruchpunkt) weitet
          dann Karte/Seite auf, statt zu umbrechen (Prüfbefund admin-shell,
          Punkt 3: "Detailseite bei 820px ebenfalls ... breit", derselbe
          Fehlklasse wie <main> in components/admin/Shell.tsx). break-all
          ergänzend an den Links, analog zur Teilen-URL weiter unten auf
          dieser Seite. */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">{admin.detail.customer.name}</dt>
        <dd className="text-text">{name || admin.common.none}</dd>

        <dt className="text-muted">{admin.detail.customer.city}</dt>
        <dd className="text-text">{inquiry.city || admin.common.none}</dd>

        <dt className="text-muted">{admin.detail.customer.phone}</dt>
        <dd className="text-text">
          {inquiry.phone ? (
            <a className="break-all text-red-bright hover:underline" href={`tel:${inquiry.phone}`}>
              {inquiry.phone}
            </a>
          ) : (
            admin.common.none
          )}
        </dd>

        <dt className="text-muted">{admin.detail.customer.email}</dt>
        <dd className="text-text">
          {inquiry.email ? (
            <a className="break-all text-red-bright hover:underline" href={`mailto:${inquiry.email}`}>
              {inquiry.email}
            </a>
          ) : (
            admin.common.none
          )}
        </dd>

        <dt className="text-muted">{admin.detail.customer.channel}</dt>
        <dd className="text-text">{channel ?? admin.common.none}</dd>

        <dt className="text-muted">{admin.detail.customer.relationship}</dt>
        <dd className="text-text">
          {inquiry.been_here ? admin.detail.customer.existingCustomer : admin.detail.customer.newCustomer}
        </dd>
      </dl>
    </Card>
  );
}
