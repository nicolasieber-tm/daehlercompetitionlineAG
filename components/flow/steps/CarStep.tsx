"use client";

// Schritt 1 "Ihr Fahrzeug": Marken-Chips, Familien-Kacheln, Motorisierungs-
// Chips (gruppiert nach Kraftstoff), Serienleistungs-Chips, Fahrzeugfoto,
// Baujahr und "schon einmal bei uns gewesen". Siehe docs/vorschau.html
// viewCar() und docs/architektur.md, Abschnitt "Kundenflow" Punkt 1.
import type { Dispatch } from "react";
import { Chip, Field, Question, StepLabel, Tile } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";
import type { Brand, Fuel } from "@/lib/supabase/rows";
import type { FlowAction, FlowState } from "../state";
import { YEAR_OPTIONS_BASE, effectiveSeriesPs } from "../state";
import { vehicleDisplayName } from "../vehicleLabel";

const FUEL_ORDER: Fuel[] = ["benzin", "diesel", "elektro"];

export function CarStep({
  families,
  state,
  dispatch,
}: {
  families: CatalogFamily[];
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}) {
  const { t, tf } = useT();

  const brands = Array.from(new Set(families.map((f) => f.brand)));
  const selectedBrand = state.selectedBrand ?? brands[0] ?? null;
  const familiesOfBrand = families.filter((f) => f.brand === selectedBrand);
  const selectedFamily = families.find((f) => f.id === state.familyId) ?? null;
  const selectedModel = selectedFamily?.models.find((m) => m.id === state.modelId) ?? null;

  const fuelGroups = new Map<Fuel | "none", CatalogModel[]>();
  if (selectedFamily) {
    for (const model of selectedFamily.models) {
      const key = (model.fuel ?? "none") as Fuel | "none";
      const arr = fuelGroups.get(key);
      if (arr) arr.push(model);
      else fuelGroups.set(key, [model]);
    }
  }
  const orderedFuelKeys: (Fuel | "none")[] = [
    ...FUEL_ORDER.filter((f) => fuelGroups.has(f)),
    ...(fuelGroups.has("none") ? (["none"] as const) : []),
  ];

  const seriesPs = selectedModel
    ? effectiveSeriesPs(selectedModel.seriesPs, selectedModel.seriesPsSuggested, state.seriesPsChoice)
    : null;
  const showSeriesPsChoice =
    !!selectedModel && selectedModel.seriesPs == null && selectedModel.seriesPsSuggested.length > 1;

  // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
  // Getriebefrage nur bei Modellen mit mindestens einem getriebespezifischen
  // Produkt, Pflicht vor "Weiter" (siehe components/flow/Flow.tsx canNext),
  // analog den Serienleistungs-Chips oben.
  const showGearboxChoice = !!selectedModel && selectedModel.hasGearboxSpecificProducts;
  const gearboxOptions: { value: "manual" | "automatic" | "unknown"; label: string }[] = [
    { value: "manual", label: t.steps.car.gearboxManual },
    { value: "automatic", label: t.steps.car.gearboxAutomatic },
    { value: "unknown", label: t.steps.car.gearboxUnknown },
  ];

  return (
    <div>
      <StepLabel>{t.steps.car.label}</StepLabel>
      <Question>{t.steps.car.question}</Question>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t.steps.car.question}>
        {brands.map((b) => (
          <Chip
            key={b}
            active={selectedBrand === b}
            onClick={() => dispatch({ type: "SET_BRAND", brand: b as Brand })}
          >
            {b}
          </Chip>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 xs:grid-cols-2 md2:grid-cols-3">
        {familiesOfBrand.map((family) => (
          <Tile
            key={family.id}
            title={family.name}
            imageUrl={family.photoUrl ?? undefined}
            badge={family.hasPricelist ? t.steps.car.photoHint : undefined}
            selected={state.familyId === family.id}
            onClick={() => dispatch({ type: "SELECT_FAMILY", familyId: family.id, hasPricelist: family.hasPricelist })}
          />
        ))}
      </div>

      {selectedFamily && selectedFamily.models.length > 0 ? (
        <div className="mt-6 flex flex-col gap-4">
          {orderedFuelKeys.map((key) => (
            <div key={key}>
              {key !== "none" ? (
                <div className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  {t.steps.car.fuelGroups[key]}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(fuelGroups.get(key) ?? []).map((model) => (
                  <Chip
                    key={model.id}
                    active={state.modelId === model.id}
                    onClick={() => dispatch({ type: "SELECT_MODEL", modelId: model.id })}
                  >
                    {model.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showSeriesPsChoice ? (
        <div className="mt-6">
          <StepLabel>{t.steps.car.seriesPsChoice}</StepLabel>
          <div className="flex flex-wrap gap-2">
            {selectedModel!.seriesPsSuggested.map((ps) => (
              <Chip key={ps} active={state.seriesPsChoice === ps} onClick={() => dispatch({ type: "SET_SERIES_PS", ps })}>
                {ps} PS
              </Chip>
            ))}
          </div>
          {/* Ohne feste model.seriesPs und mit mehreren Vorschlägen bleibt
              "Weiter" gesperrt, bis eine Serienleistung gewählt ist (siehe
              Flow.tsx canNext) - ohne diesen Hinweistext wäre für den
              Kunden nicht ersichtlich, WARUM der Button deaktiviert ist. */}
          {state.seriesPsChoice === null ? (
            <p className="mt-2 text-[13px] text-muted" aria-live="polite">
              {t.steps.car.seriesPsRequired}
            </p>
          ) : null}
        </div>
      ) : null}

      {showGearboxChoice ? (
        <div className="mt-6">
          <StepLabel>{t.steps.car.gearboxQuestion}</StepLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.steps.car.gearboxQuestion}>
            {gearboxOptions.map((option) => (
              <Chip
                key={option.value}
                active={state.gearboxChoice === option.value}
                onClick={() => dispatch({ type: "SET_GEARBOX", gearbox: option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          {/* Pflicht vor "Weiter" (siehe Flow.tsx canNext), analog dem
              Serienleistungs-Hinweis oben. */}
          {state.gearboxChoice === null ? (
            <p className="mt-2 text-[13px] text-muted" aria-live="polite">
              {t.steps.car.gearboxRequired}
            </p>
          ) : null}
        </div>
      ) : null}

      {selectedFamily && selectedFamily.photoUrl ? (
        <div className="relative mt-[18px] aspect-[21/9] overflow-hidden border border-line bg-panel-alt bg-cover bg-center" style={{ backgroundImage: `url(${selectedFamily.photoUrl})` }}>
          <span className="absolute bottom-3 left-3.5 bg-bg/75 px-2.5 py-1 font-display text-[13px] uppercase tracking-[0.08em] text-white">
            {tf(t.steps.car.carShotCaption, { model: vehicleDisplayName(selectedFamily, selectedModel) })}
          </span>
        </div>
      ) : null}

      {selectedModel ? (
        <div className="mt-[18px] font-mono text-sm tabular-nums text-muted">
          {selectedModel.seriesPs != null && selectedModel.seriesNm != null ? (
            <span>{tf(t.steps.car.seriesKnown, { ps: selectedModel.seriesPs, nm: selectedModel.seriesNm })}</span>
          ) : seriesPs != null ? (
            <span>
              <b className="mr-1 font-display text-[22px] font-semibold text-text">{seriesPs}</b>
              {t.steps.category.psCounter.seriesUnit}
            </span>
          ) : (
            <span>{t.steps.car.seriesUnknown}</span>
          )}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 xs:grid-cols-2">
        <Field
          as="select"
          label={t.steps.car.yearLabel}
          inputProps={{
            value: state.year,
            onChange: (e) => dispatch({ type: "SET_YEAR", year: e.target.value }),
          }}
        >
          {[...YEAR_OPTIONS_BASE, t.steps.car.yearOlder].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Field>
        <Field
          as="select"
          label={t.steps.car.beenHereLabel}
          inputProps={{
            value: state.beenHere ? "yes" : "no",
            onChange: (e) => dispatch({ type: "SET_BEEN_HERE", beenHere: e.target.value === "yes" }),
          }}
        >
          <option value="no">{t.steps.car.beenHereNo}</option>
          <option value="yes">{t.steps.car.beenHereYes}</option>
        </Field>
      </div>
    </div>
  );
}
