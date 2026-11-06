"use client";

// Schritt 1 "Ihr Fahrzeug": Marken-Chips, Familien-Kacheln, Motorisierungs-
// Chips (gruppiert nach Kraftstoff), Serienleistungs-Chips, Fahrzeugfoto,
// Baujahr und "schon einmal bei uns gewesen". Siehe docs/vorschau.html
// viewCar() und docs/architektur.md, Abschnitt "Kundenflow" Punkt 1.
import { useRef, useState } from "react";
import type { Dispatch, KeyboardEvent } from "react";
import { ChoiceLabel, Chip, Field, Question, StepLabel, Tile } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";
import { vehicleLineOptions } from "@/lib/catalog/vehicle-label";
import { searchVehicles, type VehicleSearchHit } from "@/lib/catalog/vehicle-search";
import type { Brand, Fuel } from "@/lib/db/rows";
import type { FlowAction, FlowState } from "../state";
import { YEAR_OPTIONS_BASE, allSelectedProducts, bodyStyleFromLine, effectiveSeriesPs } from "../state";
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

  // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
  // Motorisierungen, das Modell ist X1 oder X2"): Frage nur bei mehrdeutiger
  // Baureihe (vehicleLineOptions() liefert dann die Alternativen, sonst
  // leer), Pflicht vor "Weiter" wie Serienleistung/Getriebe oben.
  const lineOptions = selectedFamily && selectedModel ? vehicleLineOptions(selectedFamily, selectedModel) : [];

  // Entscheid 21.09.2026 (Karosserieform/Antrieb, lib/catalog/body-style.ts,
  // lib/catalog/drive.ts): Karosserie-Frage nur, wenn das Modell Produkte
  // mit unterschiedlichen Karosserieformen hat (bodyStyleOptions) UND die
  // Modellwahl oben die Karosserie nicht schon festlegt (z.B. «Cabrio» bei
  // 4er G22/G23/G26). Antriebs-Frage nur bei Produkten für beide Antriebe.
  // Beide Pflicht vor "Weiter" (Flow.tsx canNext).
  const bodyStyleOptions = selectedModel?.bodyStyleOptions ?? [];
  const showBodyStyleChoice =
    bodyStyleOptions.length > 0 && bodyStyleFromLine(selectedFamily, selectedModel, state.line) === null;
  const driveOptions = selectedModel?.driveOptions ?? [];

  // Rückmeldung dÄHLer 14.10.2026: ein Wechsel von Baureihe, Version oder
  // Serienleistung leert bzw. filtert die bereits gewählten Produkte (siehe
  // state.ts SELECT_FAMILY/SELECT_MODEL/SET_SERIES_PS). Bisher geschah das
  // still, wer zurückging und kurz eine andere Version antippte, verlor
  // seine Auswahl unbemerkt. Jetzt erst nach Rückfrage.
  const hasSelections = allSelectedProducts(state).length > 0;
  function confirmSelectionReset(): boolean {
    return !hasSelections || window.confirm(t.steps.car.changeResetsSelection);
  }

  // Rückmeldung 06.11.2026: Suche statt Scrollen durch alle Kacheln,
  // Vorschläge schon beim Tippen (lib/catalog/vehicle-search.ts).
  const [query, setQuery] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const modelSectionRef = useRef<HTMLDivElement>(null);
  const hits = searchVehicles(families, query);
  const hitsId = "vehicle-search-hits";

  function pickHit(hit: VehicleSearchHit) {
    const { family, model } = hit;
    const familyChanges = state.familyId !== family.id;
    const modelChanges = model !== null && state.modelId !== model.id;
    if ((familyChanges || (modelChanges && state.modelId !== null)) && !confirmSelectionReset()) return;
    dispatch({ type: "SET_BRAND", brand: family.brand });
    if (familyChanges) dispatch({ type: "SELECT_FAMILY", familyId: family.id, hasPricelist: family.hasPricelist });
    if (model && modelChanges) dispatch({ type: "SELECT_MODEL", modelId: model.id });
    setQuery("");
    setActiveHit(0);
    requestAnimationFrame(() => modelSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hits.length > 0) {
      e.preventDefault();
      setActiveHit((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length > 0) {
      e.preventDefault();
      setActiveHit((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[activeHit]) {
      e.preventDefault();
      pickHit(hits[activeHit]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div>
      <StepLabel>{t.steps.car.label}</StepLabel>
      <Question>{t.steps.car.question}</Question>

      <div className="mt-6">
        <input
          type="search"
          role="combobox"
          aria-label={t.steps.car.searchLabel}
          aria-expanded={hits.length > 0}
          aria-controls={hitsId}
          aria-activedescendant={hits.length > 0 ? `${hitsId}-${activeHit}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={t.steps.car.searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveHit(0);
          }}
          onKeyDown={onSearchKeyDown}
          // Auf dem Handy deckt die Tastatur sonst die Vorschläge unter dem Feld ab.
          onFocus={(e) => {
            if (window.innerWidth < 768) e.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="w-full rounded-[2px] border border-line-alt bg-panel px-3 py-[11px] text-base text-text placeholder:text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2"
        />
        {query.trim() !== "" ? (
          hits.length > 0 ? (
            <ul id={hitsId} role="listbox" aria-label={t.steps.car.searchLabel} className="border border-t-0 border-line-alt bg-panel">
              {hits.map((hit, i) => (
                <li
                  key={`${hit.family.id}-${hit.model?.id ?? ""}`}
                  id={`${hitsId}-${i}`}
                  role="option"
                  aria-selected={i === activeHit}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickHit(hit)}
                  onMouseEnter={() => setActiveHit(i)}
                  className={[
                    "flex min-h-11 cursor-pointer items-baseline gap-2 border-t border-line px-3 py-2.5 first:border-t-0",
                    i === activeHit ? "bg-panel-alt" : "",
                  ].join(" ")}
                >
                  <span className="text-text">{hit.model ? hit.model.name : hit.family.name}</span>
                  <span className="truncate text-sm text-muted">
                    {hit.model ? `${hit.family.brand} ${hit.family.name}` : hit.family.brand}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border border-t-0 border-line-alt bg-panel px-3 py-2.5 text-sm text-muted">
              {t.steps.car.searchNoResults}
            </p>
          )
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t.steps.car.question}>
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
            onClick={() => {
              if (state.familyId === family.id || !confirmSelectionReset()) return;
              dispatch({ type: "SELECT_FAMILY", familyId: family.id, hasPricelist: family.hasPricelist });
            }}
          />
        ))}
      </div>

      {selectedFamily && selectedFamily.models.length > 0 ? (
        <div ref={modelSectionRef} className="mt-7">
          <ChoiceLabel hint={state.modelId === null ? t.steps.car.modelRequired : undefined} missing={state.modelId === null}>
            {t.steps.car.modelQuestion}
          </ChoiceLabel>
          <div className="flex flex-col gap-4">
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
                      onClick={() => {
                        if (state.modelId === model.id || !confirmSelectionReset()) return;
                        dispatch({ type: "SELECT_MODEL", modelId: model.id });
                      }}
                    >
                      {model.name}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showSeriesPsChoice ? (
        <div className="mt-6">
          <ChoiceLabel hint={state.seriesPsChoice === null ? t.steps.car.seriesPsRequired : undefined} missing={state.seriesPsChoice === null}>
            {t.steps.car.seriesPsChoice}
          </ChoiceLabel>
          <div className="flex flex-wrap gap-2">
            {selectedModel!.seriesPsSuggested.map((ps) => (
              <Chip
                key={ps}
                active={state.seriesPsChoice === ps}
                onClick={() => {
                  if (state.seriesPsChoice === ps) return;
                  if (state.seriesPsChoice !== null && !confirmSelectionReset()) return;
                  dispatch({ type: "SET_SERIES_PS", ps });
                }}
              >
                {ps} PS
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {showGearboxChoice ? (
        <div className="mt-6">
          <ChoiceLabel hint={state.gearboxChoice === null ? t.steps.car.gearboxRequired : undefined} missing={state.gearboxChoice === null}>
            {t.steps.car.gearboxQuestion}
          </ChoiceLabel>
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
        </div>
      ) : null}

      {lineOptions.length > 0 ? (
        <div className="mt-6">
          <ChoiceLabel hint={state.line === null ? t.steps.car.lineRequired : undefined} missing={state.line === null}>
            {t.steps.car.lineQuestion}
          </ChoiceLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.steps.car.lineQuestion}>
            {lineOptions.map((option) => (
              <Chip
                key={option.id}
                active={state.line === option.id}
                onClick={() => dispatch({ type: "SET_LINE", line: option.id })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {showBodyStyleChoice ? (
        <div className="mt-6">
          <ChoiceLabel hint={state.bodyStyleChoice === null ? t.steps.car.bodyStyleRequired : undefined} missing={state.bodyStyleChoice === null}>
            {t.steps.car.bodyStyleQuestion}
          </ChoiceLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.steps.car.bodyStyleQuestion}>
            {bodyStyleOptions.map((style) => (
              <Chip
                key={style}
                active={state.bodyStyleChoice === style}
                onClick={() => dispatch({ type: "SET_BODY_STYLE", bodyStyle: style })}
              >
                {t.steps.car.bodyStyles[style]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {driveOptions.length > 0 ? (
        <div className="mt-6">
          <ChoiceLabel hint={state.driveChoice === null ? t.steps.car.driveRequired : undefined} missing={state.driveChoice === null}>
            {t.steps.car.driveQuestion}
          </ChoiceLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.steps.car.driveQuestion}>
            {driveOptions.map((drive) => (
              <Chip key={drive} active={state.driveChoice === drive} onClick={() => dispatch({ type: "SET_DRIVE", drive })}>
                {t.steps.car.drives[drive]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {selectedFamily && selectedFamily.photoUrl ? (
        <div className="relative mt-[18px] aspect-[21/9] overflow-hidden border border-line bg-panel-alt bg-cover bg-center" style={{ backgroundImage: `url(${selectedFamily.photoUrl})` }}>
          <span className="absolute bottom-3 left-3.5 bg-bg/75 px-2.5 py-1 font-display text-[13px] uppercase tracking-[0.08em] text-white">
            {tf(t.steps.car.carShotCaption, { model: vehicleDisplayName(selectedFamily, selectedModel, state.line) })}
          </span>
        </div>
      ) : null}

      {selectedModel ? (
        <div className="mt-[18px] font-mono text-sm tabular-nums text-muted">
          {seriesPs != null ? (
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
