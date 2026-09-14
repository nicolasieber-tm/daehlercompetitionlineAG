"use client";

// Kategorie-Schritt (motor/auspuff/fahrwerk/raeder/exterieur/interieur):
// Kopf mit Kategoriebild, Produktgruppen aus der API, PS-Zähler (nur Motor),
// Folgefrage, "Passt gut dazu"-Upsell, Kleingedrucktes (pricelist_notes).
// Siehe docs/vorschau.html viewCat() und docs/architektur.md Abschnitt
// "Kundenflow" Punkt 3.
import type { Dispatch } from "react";
import { Button, Tile } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { chfFrom } from "@/lib/i18n/format";
import { de } from "@/lib/i18n/de";
import type { CatalogFamily, CatalogModel, CatalogProduct, CategoryNote, ProductGroup } from "@/lib/catalog/queries";
import type { FlowCategory } from "@/lib/supabase/rows";
import type { FlowAction, FlowState } from "../state";
import { motorProductVisible } from "../state";
import { usePsCounter } from "../usePsCounter";
import { UPSELL_TARGET } from "../upsell";
import { vehicleDisplayName } from "../vehicleLabel";

function priceText(
  product: Pick<CatalogProduct, "priceStatus" | "priceTotal">,
  t: ReturnType<typeof useT>["t"],
  tf: ReturnType<typeof useT>["tf"],
  locale: ReturnType<typeof useT>["locale"],
): string {
  if (product.priceStatus === "priced" && product.priceTotal != null) {
    return tf(t.priceStatus.priced, { price: chfFrom(product.priceTotal, locale) });
  }
  if (product.priceStatus === "in_preparation") return t.priceStatus.in_preparation;
  return t.priceStatus.on_request;
}

function firstPriced(groups: ProductGroup[], category: FlowCategory, seriesPs: number | null): CatalogProduct | null {
  for (const g of groups) {
    if (g.category !== category) continue;
    for (const p of g.products) {
      if (category === "motor" && !motorProductVisible(p, seriesPs)) continue;
      if (p.priceStatus === "priced" && p.priceTotal != null) return p;
    }
  }
  return null;
}

export function CategoryStep({
  category,
  family,
  model,
  seriesPs,
  allGroups,
  notes,
  state,
  dispatch,
}: {
  category: FlowCategory;
  family: CatalogFamily;
  model: CatalogModel | null;
  seriesPs: number | null;
  allGroups: ProductGroup[];
  notes: CategoryNote[];
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}) {
  const { t, tf, locale } = useT();

  const picked = state.selections[category] ?? [];
  const groupsHere = allGroups.filter((g) => g.category === category);
  const flowTitleDe = de.steps.wish.categories[category].title.trim().toLowerCase();

  const stageProduct = picked.find((p) => p.variantGroup === "leistung" && p.psTo != null) ?? null;
  const psTarget = stageProduct?.psTo ?? seriesPs ?? 0;
  const animatedTarget = usePsCounter(psTarget);

  const followUpDict = t.steps.category.followUp;
  const followUp = category in followUpDict ? followUpDict[category as keyof typeof followUpDict] : undefined;

  const upsellTarget = UPSELL_TARGET[category];
  // t.steps.category.upsell ist nach der QUELL-Kategorie geschlüsselt (wie
  // UPSELL in docs/vorschau.html: upsell.motor = "Passt gut dazu: Auspuff"),
  // nicht nach der Zielkategorie, die "Dazunehmen" tatsächlich einfügt.
  const upsellTexts = t.steps.category.upsell[category];
  const upsellOffered = !state.categories.includes(upsellTarget);
  const upsellAdded = state.upsoldCategories.includes(upsellTarget) && state.categories.includes(upsellTarget);
  const upsellFirstPriced = firstPriced(allGroups, upsellTarget, seriesPs);

  // pricelist_notes.category ist die rohe Excel-Kategorie (z.B. "Bremse"
  // gehört zur Flow-Kategorie fahrwerk), deshalb hier über die tatsächlich
  // in dieser Flow-Kategorie vorkommenden Excel-Kategorien gefiltert statt
  // 1:1 über den Flow-Namen.
  const relevantNotes = notes.filter((n) => groupsHere.some((g) => g.sourceCategory === n.sourceCategory));

  function handlePick(product: CatalogProduct) {
    dispatch({ type: "PICK_PRODUCT", category, product });
  }

  function handleAddUpsell() {
    const product = firstPriced(allGroups, upsellTarget, seriesPs);
    dispatch({ type: "ADD_UPSELL_CATEGORY", category: upsellTarget, afterCategory: category, firstProduct: product });
  }

  function handleRemoveUpsell() {
    dispatch({ type: "REMOVE_UPSELL_CATEGORY", category: upsellTarget });
  }

  return (
    <div>
      <div className="grid grid-cols-1 items-end gap-5 sm2:grid-cols-[1fr_200px]">
        <div>
          <div className="mb-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
            {t.steps.wish.categories[category].title} · {vehicleDisplayName(family, model)}
          </div>
          <h2 className="text-balance font-display text-[clamp(28px,4vw,40px)] font-bold uppercase leading-[1.02] tracking-[0.01em]">
            {t.steps.category.questions[category]}
          </h2>
        </div>
        <div
          className="hidden aspect-[3/2] border border-line bg-panel-alt bg-cover bg-center sm2:block"
          style={{ backgroundImage: `url(/img/flow/cat_${category}.jpg)` }}
        />
      </div>

      <p className="mt-2 max-w-[58ch] text-muted">
        {tf(t.steps.category.priceHintData, { model: vehicleDisplayName(family, model) })}
      </p>

      <div className="mt-5 flex flex-col gap-6">
        {groupsHere.map((group, gi) => {
          const showHeading = group.sourceCategory.trim().toLowerCase() !== flowTitleDe;
          const visibleProducts =
            category === "motor" ? group.products.filter((p) => motorProductVisible(p, seriesPs)) : group.products;
          if (visibleProducts.length === 0) return null;
          return (
            <div key={`${group.sourceCategory}-${group.groupLabel ?? ""}-${gi}`}>
              {showHeading ? (
                <div className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted">
                  {group.sourceCategory}
                </div>
              ) : null}
              {group.groupLabel ? (
                <div className="mb-2 text-[13px] text-dim">{group.groupLabel}</div>
              ) : null}
              <div className="grid grid-cols-1 gap-2.5 xs:grid-cols-2 md2:grid-cols-3">
                {visibleProducts.map((product) => (
                  <Tile
                    key={product.id}
                    title={product.name}
                    description={product.description ? <span className="whitespace-pre-line">{product.description}</span> : undefined}
                    price={priceText(product, t, tf, locale)}
                    priceMuted={product.priceStatus !== "priced"}
                    selected={picked.some((p) => p.id === product.id)}
                    onClick={() => handlePick(product)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {category === "motor" && seriesPs != null ? (
        <div className="mt-5 flex flex-wrap items-center gap-4.5 border border-line bg-panel px-4.5 py-3.5">
          <div>
            <span className="font-display text-[44px] font-bold leading-none tabular-nums tracking-[0.01em]">
              {seriesPs}
            </span>
            <span className="mt-0.5 block font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">
              {t.steps.category.psCounter.seriesUnit}
            </span>
          </div>
          <span className="text-2xl text-dim">→</span>
          <div>
            <span className="font-display text-[44px] font-bold leading-none tabular-nums tracking-[0.01em] text-red-bright">
              {animatedTarget}
            </span>
            <span className="mt-0.5 block font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">
              {stageProduct
                ? tf(t.steps.category.psCounter.targetUnitWithStage, { stage: stageProduct.name })
                : t.steps.category.psCounter.targetUnitUnselected}
            </span>
          </div>
          {stageProduct ? (
            <span className="ml-auto font-mono text-[13px] text-ok">
              {tf(t.steps.category.psCounter.plus, {
                diff: (stageProduct.psTo ?? seriesPs) - seriesPs,
                detail: `${stageProduct.nmTo ?? "?"} Nm`,
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      {followUp ? (
        <div className="mt-6">
          <div className="mb-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
            {followUp.question}
          </div>
          <div className="flex flex-wrap gap-2">
            {followUp.options.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={state.followUpAnswers[category] === option.id}
                onClick={() => dispatch({ type: "SET_FOLLOW_UP", category, optionId: option.id })}
                className={[
                  // min-h-11 (44px) wie components/ui/Chip.tsx (Touch-Ziel,
                  // Prüfung Minor-Befund).
                  "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 font-display text-[15px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
                  state.followUpAnswers[category] === option.id
                    ? "border-red bg-red text-white"
                    : "border-line-alt bg-transparent text-muted hover:border-muted hover:text-text",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {upsellOffered ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-dashed border-line-alt bg-panel px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <b className="font-display text-[17px] font-semibold uppercase tracking-[0.06em]">{upsellTexts.title}</b>
            <span className="text-[13px] text-muted">
              {upsellTexts.text}
              {upsellFirstPriced ? (
                <em className="not-italic text-red-bright"> {upsellFirstPriced.name} {tf(t.priceStatus.priced, { price: chfFrom(upsellFirstPriced.priceTotal!, locale) })}</em>
              ) : null}
            </span>
          </div>
          <Button variant="line" size="sm" onClick={handleAddUpsell}>
            {t.steps.category.upsellAdd}
          </Button>
        </div>
      ) : upsellAdded ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-solid border-ok bg-panel px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <b className="font-display text-[17px] font-semibold uppercase tracking-[0.06em]">
              {t.steps.wish.categories[upsellTarget].title} {t.steps.category.upsellAdded.titleSuffix}
            </b>
            <span className="text-[13px] text-muted">{t.steps.category.upsellAdded.subtitle}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRemoveUpsell}>
            {t.steps.category.upsellAdded.remove}
          </Button>
        </div>
      ) : null}

      {relevantNotes.length > 0 ? (
        <p className="mt-3.5 text-[13px] text-dim">{relevantNotes.map((n) => n.text).join(" ")}</p>
      ) : null}
    </div>
  );
}
