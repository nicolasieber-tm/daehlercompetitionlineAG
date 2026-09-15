import { admin } from "@/lib/i18n/admin";
import { vehicleLabel } from "@/lib/mail/render";
import { vehicleInternalLine } from "@/lib/catalog/vehicle-label";
import type { MailInquiryContext } from "@/lib/mail/types";
import { Card } from "./Card";

export function VehicleCard({ ctx }: { ctx: MailInquiryContext }) {
  const { inquiry, family, model } = ctx;
  const label = vehicleLabel({ family, model, vehicleText: inquiry.vehicle_text });

  return (
    <Card title={admin.detail.vehicle.title}>
      {/* minmax(0,1fr): siehe CustomerCard.tsx - verhindert, dass die Wert-Spalte
          auf ihre min-content-Breite aufweitet (Prüfbefund admin-shell, Punkt 3). */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm break-words">
        <dt className="text-muted">{admin.detail.vehicle.title}</dt>
        <dd className="text-text">{label || admin.common.none}</dd>

        <dt className="text-muted">{admin.detail.vehicle.year}</dt>
        <dd className="text-text">{inquiry.year || admin.common.none}</dd>

        {model?.series_ps != null && (
          <>
            <dt className="text-muted">{admin.detail.vehicle.series}</dt>
            <dd className="font-mono text-text">
              {model.series_ps} PS{model.series_nm != null ? ` / ${model.series_nm} Nm` : ""}
            </dd>
          </>
        )}

        {/* Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE",
            Punkt 3): nur sichtbar, wenn die Getriebefrage gestellt wurde. */}
        {inquiry.gearbox && (
          <>
            <dt className="text-muted">{admin.detail.vehicle.gearbox}</dt>
            <dd className="text-text">{(admin.gearbox as Record<string, string>)[inquiry.gearbox] ?? inquiry.gearbox}</dd>
          </>
        )}

        {family && !family.has_pricelist && (
          <>
            <dt className="text-muted" />
            <dd className="text-warn">{admin.detail.vehicle.noPricelist}</dd>
          </>
        )}
      </dl>
      {/* Ergänzung 15.09.2026 (docs/architektur.md, Abschnitt
          "Fahrzeugbezeichnung", Regel 5): roh, ohne die Aufbereitung von
          vehicleLabel() oben - damit dÄHLer die Excel-Preisliste (benannt
          nach dem rohen Familiennamen) sofort zuordnen kann. */}
      {family && (
        <p className="mt-2 text-xs text-dim">{vehicleInternalLine(family, model)}</p>
      )}
    </Card>
  );
}
