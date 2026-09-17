"use client";

// Abschluss-Screen: Nummer, Dank, Fahrzeugfoto, Vorher/Nachher, Teilen-
// Kacheln, Summary-Box, nächste Schritte, "Nochmals von vorne". Siehe
// docs/vorschau.html viewDone() und CLAUDE.md Kundenflow Punkt 6.
import { useState } from "react";
import type { Dispatch } from "react";
import { BeforeAfter, Button, PowerAfterValue, PowerBeforeValue, Question, StepLabel, Summary } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { chfFrom } from "@/lib/i18n/format";
import { displayItemFields, isStageItem } from "@/lib/catalog/product-display";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";
import type { FlowAction, FlowState } from "../state";
import { allSelectedProducts, hasUnpricedSelection, selectionTotal } from "../state";
import { buildBeforeAfterRows } from "../beforeAfter";
import { vehicleDisplayName } from "../vehicleLabel";

export function DoneStep({
  family,
  model,
  seriesPs,
  seriesNm,
  state,
  dispatch,
}: {
  family: CatalogFamily | null;
  model: CatalogModel | null;
  seriesPs: number | null;
  seriesNm: number | null;
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}) {
  const { t, tf, locale } = useT();
  const result = state.result!;
  const vehicleLabel = family ? vehicleDisplayName(family, model, state.line) : "";

  const [shareState, setShareState] = useState<{ status: "idle" | "success" | "error"; url: string | null }>({
    status: "idle",
    url: null,
  });

  async function handleShareLink() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/p/${result.shareToken}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: t.brand.name, url });
        setShareState({ status: "success", url });
        return;
      } catch {
        // Nutzer hat abgebrochen oder Share ist fehlgeschlagen: auf
        // Zwischenablage zurückfallen.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState({ status: "success", url });
    } catch {
      setShareState({ status: "error", url: null });
    }
  }

  const total = selectionTotal(state);
  const unpriced = hasUnpricedSelection(state);
  const totalLabel = unpriced ? t.steps.done.package.totalWithOnRequest : t.steps.done.package.total;
  const totalValue = total != null ? chfFrom(total, locale) : t.steps.done.package.onRequest;

  const summaryLines = state.categories.flatMap((c) => {
    const items = state.selections[c] ?? [];
    if (items.length === 0) {
      return [
        {
          key: c,
          category: t.steps.wish.categories[c].title,
          name: t.steps.done.package.categoryAdviceLine,
          price: t.priceStatus.on_request,
        },
      ];
    }
    return items.map((p) => {
      // Nachzug Prüfung Phase D, Punkt 1: dieselbe Positionsdarstellung wie
      // in der Kachel (CategoryStep.tsx) und in den Mails/dem Antwortentwurf
      // (displayItemFields()), statt des rohen Excel-Namens ("Stufe 1: (Basis
      // 460 PS) 590PS / 720Nm (M6 & A8-Getriebe)").
      const display = displayItemFields(
        {
          name: p.name,
          description: p.description,
          isStage: isStageItem({ name: p.name, variant_group: p.variantGroup, ps_to: p.psTo }),
          psTo: p.psTo,
          nmTo: p.nmTo,
        },
        locale,
      );
      return {
        key: p.id,
        category: t.steps.wish.categories[c].title,
        name: display.name,
        price:
          p.priceStatus === "priced" && p.priceTotal != null
            ? tf(t.priceStatus.priced, { price: chfFrom(p.priceTotal, locale) })
            : p.priceStatus === "in_preparation"
              ? t.priceStatus.in_preparation
              : t.priceStatus.on_request,
      };
    });
  });
  if (state.consulting) {
    summaryLines.push({
      key: "consulting",
      category: t.steps.wish.completePackage.title,
      name: t.steps.done.package.adviceLine,
      price: t.priceStatus.on_request,
    });
  }

  const beforeAfterRows = buildBeforeAfterRows(
    {
      categories: state.categories,
      items: allSelectedProducts(state).map((p) => ({
        category: p.category,
        name: p.name,
        description: p.description,
        psTo: p.psTo,
        nmTo: p.nmTo,
        variantGroup: p.variantGroup,
      })),
      consulting: state.consulting,
      character: state.character,
      seriesPs,
      seriesNm,
    },
    t,
    locale,
  );
  // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
  // die "Leistung"-Zeile bekommt bei bekannten Vorher/Nachher-Zahlen die
  // grosse Zahlen-Darstellung (components/ui/PowerValue.tsx) statt des
  // Text-Fallbacks - buildBeforeAfterRows() liefert row.power nur dann.
  // Befund Prüfer (Beleg Anfrage 2026-0293): row.extras (weitere gewählte
  // Motor-Optionen neben der Stufe, z. B. "Sportluftfilter Satz") bleibt
  // dabei angehängt - sonst verschwinden sie aus der Zeile, sobald eine
  // Stufe gewählt ist und die Zahlen-Darstellung greift.
  const beforeAfterRowsForDisplay = beforeAfterRows.map((row) =>
    row.power
      ? {
          ...row,
          before: <PowerBeforeValue power={row.power} />,
          after: (
            <>
              <PowerAfterValue power={row.power} />
              {row.extras ? ` · ${row.extras}` : null}
            </>
          ),
        }
      : row,
  );

  return (
    <div>
      <StepLabel>{tf(t.steps.done.ticketLabel, { number: result.number })}</StepLabel>
      <Question>{tf(t.steps.done.title, { first: state.contact.firstName })}</Question>
      <p className="mt-2 max-w-[58ch] text-muted">
        {tf(t.steps.done.subtitle, {
          model: vehicleLabel,
          email: state.contact.email,
          channel: t.steps.contact.channels.find((c) => c.id === state.channel)?.label ?? state.channel,
        })}
      </p>

      {family?.photoUrl ? (
        <div
          className="relative mt-[18px] aspect-[21/9] overflow-hidden border border-line bg-panel-alt bg-cover bg-center"
          style={{ backgroundImage: `url(${family.photoUrl})` }}
        >
          <span className="absolute bottom-3 left-3.5 bg-bg/75 px-2.5 py-1 font-display text-[13px] uppercase tracking-[0.08em] text-white">
            {tf(t.steps.done.carShotCaption, { model: vehicleLabel })}
          </span>
        </div>
      ) : null}

      <BeforeAfter
        beforeLabel={t.steps.done.beforeAfter.before}
        afterLabel={t.steps.done.beforeAfter.after}
        rows={beforeAfterRowsForDisplay}
      />

      <div className="mt-5">
        <button
          type="button"
          onClick={handleShareLink}
          aria-live="polite"
          className={[
            "flex w-full flex-col gap-1 border bg-panel px-4 py-4 text-left transition-colors duration-150 hover:border-red-bright xs:max-w-sm",
            shareState.status === "success" ? "border-ok" : "border-line-alt",
          ].join(" ")}
        >
          {shareState.status === "success" ? (
            <>
              <b className="font-display text-lg font-semibold uppercase tracking-[0.06em] text-ok">
                {t.steps.done.share.link.success.title}
              </b>
              <code className="break-all font-mono text-xs text-text">{shareState.url}</code>
              <span className="text-[13px] text-muted">{t.steps.done.share.link.success.subtitle}</span>
            </>
          ) : (
            <>
              <b className="font-display text-lg font-semibold uppercase tracking-[0.06em]">{t.steps.done.share.link.title}</b>
              <span className="text-[13px] text-muted">{t.steps.done.share.link.subtitle}</span>
              {shareState.status === "error" ? <span className="text-[13px] text-warn">{t.errors.shareCopyFailed}</span> : null}
            </>
          )}
        </button>
      </div>

      <Summary
        header={t.steps.done.package.header}
        headerMeta={`${vehicleLabel} · ${state.year}`}
        lines={summaryLines}
        totalLabel={totalLabel}
        totalValue={totalValue}
      />

      <div className="mt-5 grid grid-cols-1 gap-2.5 md2:grid-cols-3">
        <div className="border-t-2 border-ok pt-2.5">
          <b className="mb-0.5 block font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-text">
            {t.steps.done.next.now.title}
          </b>
          <span className="text-sm text-muted">{t.steps.done.next.now.text}</span>
        </div>
        <div className="border-t-2 border-line-alt pt-2.5">
          <b className="mb-0.5 block font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-text">
            {t.steps.done.next.day1.title}
          </b>
          <span className="text-sm text-muted">{t.steps.done.next.day1.text}</span>
        </div>
        <div className="border-t-2 border-line-alt pt-2.5">
          <b className="mb-0.5 block font-display text-[17px] font-semibold uppercase tracking-[0.06em] text-text">
            {t.steps.done.next.then.title}
          </b>
          <span className="text-sm text-muted">{t.steps.done.next.then.text}</span>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={() => dispatch({ type: "RESTART" })}>
          {t.steps.done.restart}
        </Button>
      </div>
    </div>
  );
}
