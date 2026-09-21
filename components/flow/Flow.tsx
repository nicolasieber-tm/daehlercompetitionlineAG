"use client";

// Orchestrator des Kundenflows: Hero, Stage-Rahmen, Fortschritt, Schritte,
// Navigation. Zustand über useReducer (siehe state.ts). Referenz für Ablauf
// und Verhalten: docs/vorschau.html; Seitenaufbau/API-Anbindung:
// docs/architektur.md, Abschnitt "Kundenflow".
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { Progress } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import type { CatalogFamily, CategoryNote, ProductGroup, ProductTranslations } from "@/lib/catalog/queries";
import { vehicleLineOptions } from "@/lib/catalog/vehicle-label";
import { Hero } from "./Hero";
import { FlowNav } from "./FlowNav";
import { CarStep } from "./steps/CarStep";
import { WishStep } from "./steps/WishStep";
import { CategoryStep } from "./steps/CategoryStep";
import { CharacterStep } from "./steps/CharacterStep";
import { ContactStep, isContactValid } from "./steps/ContactStep";
import { DoneStep } from "./steps/DoneStep";
import {
  allSelectedProducts,
  bodyStyleFromLine,
  buildSteps,
  categoryOfStep,
  effectiveBodyStyle,
  effectiveSeriesPs,
  flowReducer,
  initialFlowState,
  selectionTotal,
} from "./state";

export function Flow({ families }: { families: CatalogFamily[] }) {
  const { t, locale } = useT();
  const [state, dispatch] = useReducer(flowReducer, undefined, initialFlowState);

  const yearOlderLabel = t.steps.car.yearOlder;
  const steps = useMemo(() => buildSteps(state, yearOlderLabel), [state, yearOlderLabel]);
  const currentIndex = steps.indexOf(state.currentStep);
  const totalSteps = steps.length - 1; // "done" zählt nicht als Fortschrittsschritt (Vorschau: n = st.length-1)

  const selectedFamily = families.find((f) => f.id === state.familyId) ?? null;
  const selectedModel = selectedFamily?.models.find((m) => m.id === state.modelId) ?? null;
  const seriesPs = selectedModel
    ? effectiveSeriesPs(selectedModel.seriesPs, selectedModel.seriesPsSuggested, state.seriesPsChoice)
    : null;
  const seriesNm = selectedModel?.seriesNm ?? null;

  const currentCategory = categoryOfStep(state.currentStep);

  const loadProducts = useCallback(() => {
    if (!state.modelId) return;
    dispatch({ type: "PRODUCTS_LOADING" });
    fetch(`/api/catalog/products?model=${state.modelId}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; groups?: ProductGroup[]; notes?: CategoryNote[]; translations?: ProductTranslations; error?: string }) => {
        if (data.ok && data.groups) {
          dispatch({ type: "PRODUCTS_LOADED", groups: data.groups, notes: data.notes ?? [], translations: data.translations ?? {} });
        } else {
          dispatch({ type: "PRODUCTS_ERROR", error: data.error ?? t.errors.loadFailed });
        }
      })
      .catch(() => dispatch({ type: "PRODUCTS_ERROR", error: t.errors.loadFailed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.modelId]);

  useEffect(() => {
    if (currentCategory && state.modelId && state.productsStatus === "idle") {
      loadProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCategory, state.modelId, state.productsStatus]);

  // Bei jedem Schrittwechsel (Weiter, Zurück, Absenden -> "done") an den
  // Anfang des Flow-Rahmens scrollen, wie docs/vorschau.html go():
  // $('#flow').scrollIntoView({block:'start'}). Ohne das bleibt der
  // Viewport dort, wo der Kunde zuletzt auf "Weiter" geklickt hat, also
  // am unteren Rand des neuen Schritts (Rückmeldung Klicktest
  // 21.09.2026). Beim ersten Render nicht scrollen, sonst würde der Hero
  // beim Laden übersprungen.
  //
  // Zweiter Auslöser: Produkte fertig geladen (loading -> loaded) in einem
  // Kategorie-Schritt. Beim ersten Kategorie-Schritt ist der Inhalt im
  // Moment des Schrittwechsels nur der kurze "Lädt"-Text, das Dokument
  // wird kürzer, und wenn die Produkte eintreffen, wächst es unter dem
  // laufenden Smooth-Scroll wieder. Chrome hält dann die alte Position
  // (gemessen: scrollY unverändert, Rahmen-Oberkante 875px über dem
  // Viewport auf iPhone-Breite). Darum nach dem Laden nochmals scrollen.
  const stageRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef(state.currentStep);
  const previousProductsStatusRef = useRef(state.productsStatus);
  useEffect(() => {
    const stepChanged = previousStepRef.current !== state.currentStep;
    const productsArrived =
      currentCategory !== null && previousProductsStatusRef.current === "loading" && state.productsStatus === "loaded";
    previousStepRef.current = state.currentStep;
    previousProductsStatusRef.current = state.productsStatus;
    if (!stepChanged && !productsArrived) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stageRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [state.currentStep, state.productsStatus, currentCategory]);

  const canNext = useMemo(() => {
    switch (state.currentStep) {
      case "car": {
        if (state.familyId === null) return false;
        if (selectedFamily?.models.length === 0) return true;
        if (state.modelId === null) return false;
        // Mehrere Serienleistungs-Vorschläge ohne feste model.seriesPs
        // (z.B. M2 G87 "M2": 460/480 PS): ohne Auswahl bliebe seriesPs
        // null und der Motor-Schritt würde jede Stufe-Option ausblenden
        // (motorProductVisible), der Kunde könnte nie eine Stufe wählen.
        if (selectedModel && selectedModel.seriesPs == null && selectedModel.seriesPsSuggested.length > 1) {
          if (state.seriesPsChoice === null) return false;
        }
        // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE",
        // Punkt 3): Getriebefrage Pflicht vor "Weiter", wie die
        // Serienleistungs-Chips oben (siehe CarStep.tsx showGearboxChoice).
        if (selectedModel?.hasGearboxSpecificProducts && state.gearboxChoice === null) {
          return false;
        }
        // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
        // Motorisierungen, das Modell ist X1 oder X2"): Modellwahl Pflicht
        // vor "Weiter", wenn die Baureihe für die Motorisierung mehrdeutig
        // ist (siehe CarStep.tsx lineOptions).
        if (selectedFamily && selectedModel && vehicleLineOptions(selectedFamily, selectedModel).length > 0 && state.line === null) {
          return false;
        }
        // Entscheid 21.09.2026 (Karosserieform/Antrieb): Pflicht vor
        // "Weiter", wenn die jeweilige Frage gestellt wird (siehe
        // CarStep.tsx showBodyStyleChoice / driveOptions).
        if (
          selectedModel &&
          selectedModel.bodyStyleOptions.length > 0 &&
          bodyStyleFromLine(selectedFamily, selectedModel, state.line) === null &&
          state.bodyStyleChoice === null
        ) {
          return false;
        }
        if (selectedModel && selectedModel.driveOptions.length > 0 && state.driveChoice === null) {
          return false;
        }
        return true;
      }
      case "wish":
        return state.categories.length > 0 || state.consulting;
      case "character":
        return state.character !== null;
      case "contact":
        return isContactValid(state, t);
      default:
        return true;
    }
  }, [state, selectedFamily, selectedModel, t]);

  const submit = useCallback(async () => {
    dispatch({ type: "SUBMIT_START" });
    const payload = {
      locale,
      familyId: state.familyId,
      modelId: state.modelId,
      vehicleText: null,
      year: state.year,
      beenHere: state.beenHere,
      gearbox: state.gearboxChoice,
      // Kundenentscheid 17.09.2026: gewählte Alternative bei mehrdeutiger
      // Baureihe (lib/catalog/vehicle-label.ts vehicleLineOptions()-id),
      // null wenn die Frage nicht gestellt wurde. lib/inquiry/create.ts
      // prüft sie erneut gegen die aktuellen Optionen, bevor sie
      // gespeichert wird.
      line: state.line,
      // Entscheid 21.09.2026: wirksame Karosserieform (aus der Modellwahl
      // oder der Chip-Antwort) und Antrieb; lib/inquiry/create.ts prüft
      // beide erneut gegen die Optionen des Modells.
      bodyStyle: effectiveBodyStyle(selectedFamily, selectedModel, state),
      drive: state.driveChoice,
      // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
      // Punkt 3): effektiv wirksame Serienleistung (siehe seriesPs oben,
      // effectiveSeriesPs()) - wird für die Vorher/Nachher-Leistungszeile
      // nach dem Absenden gebraucht (Teilen-Seite, Bestätigungs-/
      // Zusammenfassungsmail), da models.series_ps bei mehreren
      // series_ps_suggested-Werten null bleibt.
      seriesPs,
      categories: state.categories,
      consulting: state.consulting,
      selections: allSelectedProducts(state).map((p) => ({ productId: p.id })),
      followUpAnswers: state.followUpAnswers,
      character: state.character,
      timing: state.timing,
      firstName: state.contact.firstName.trim(),
      lastName: state.contact.lastName.trim(),
      city: state.contact.city.trim(),
      phone: state.contact.phone.trim(),
      email: state.contact.email.trim(),
      channel: state.channel,
      message: state.message,
      privacyAccepted: state.privacyAccepted,
    };
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        id?: string;
        number?: string;
        shareToken?: string;
        estimatedTotal?: number | null;
        error?: string;
      };
      if (data.ok && data.id && data.number && data.shareToken !== undefined) {
        dispatch({
          type: "SUBMIT_SUCCESS",
          result: {
            id: data.id,
            number: data.number,
            shareToken: data.shareToken,
            estimatedTotal: data.estimatedTotal ?? null,
          },
        });
      } else {
        dispatch({ type: "SUBMIT_ERROR", error: data.error ?? t.errors.submitFailed });
      }
    } catch {
      dispatch({ type: "SUBMIT_ERROR", error: t.errors.submitFailed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, locale]);

  const handleNext = useCallback(() => {
    if (state.currentStep === "contact") {
      dispatch({ type: "MARK_SUBMIT_ATTEMPTED" });
      if (isContactValid(state, t)) void submit();
      return;
    }
    dispatch({ type: "GO_NEXT", steps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, steps, t]);

  const handleBack = useCallback(() => dispatch({ type: "GO_BACK", steps }), [steps]);

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.currentStep === "contact") handleNext();
  }

  let stepContent: ReactNode = null;
  if (state.currentStep === "car") {
    stepContent = <CarStep families={families} state={state} dispatch={dispatch} />;
  } else if (state.currentStep === "wish") {
    stepContent = <WishStep state={state} dispatch={dispatch} />;
  } else if (currentCategory) {
    if (state.productsStatus === "loading" || state.productsStatus === "idle") {
      stepContent = (
        <p className="py-16 text-center text-muted" aria-live="polite">
          {t.steps.category.loading}
        </p>
      );
    } else if (state.productsStatus === "error") {
      stepContent = (
        <div className="flex flex-col items-center gap-3 py-16 text-center" aria-live="polite">
          <p className="text-warn">{state.productsError ?? t.errors.loadFailed}</p>
          <button
            type="button"
            onClick={loadProducts}
            className="rounded-[2px] border border-line-alt px-4 py-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-text hover:border-red-bright"
          >
            {t.nav.retry}
          </button>
        </div>
      );
    } else if (selectedFamily) {
      stepContent = (
        <CategoryStep
          category={currentCategory}
          family={selectedFamily}
          model={selectedModel}
          seriesPs={seriesPs}
          allGroups={state.productGroups}
          notes={state.productNotes}
          state={state}
          dispatch={dispatch}
        />
      );
    }
  } else if (state.currentStep === "character") {
    stepContent = <CharacterStep family={selectedFamily} model={selectedModel} state={state} dispatch={dispatch} />;
  } else if (state.currentStep === "contact") {
    stepContent = <ContactStep family={selectedFamily} model={selectedModel} state={state} dispatch={dispatch} />;
  } else if (state.currentStep === "done" && state.result) {
    stepContent = (
      <DoneStep family={selectedFamily} model={selectedModel} seriesPs={seriesPs} seriesNm={seriesNm} state={state} dispatch={dispatch} />
    );
  }

  const total = selectionTotal(state);

  return (
    <div className="min-h-screen bg-bg">
      <Hero />
      <main className="mx-auto max-w-[1040px] px-4 py-9 sm:px-6">
        <div ref={stageRef} className="scroll-mt-4 border border-line bg-bg-alt">
          <div className="mx-auto max-w-[760px] px-4 py-8 xs:px-6 xs:py-9">
            <form onSubmit={handleFormSubmit}>
              {state.currentStep !== "done" ? <Progress total={totalSteps} current={currentIndex} /> : null}
              {stepContent}
              {state.currentStep !== "done" ? (
                <>
                  {state.submitStatus === "error" ? (
                    <p className="mt-4 text-[13px] text-warn" aria-live="polite">
                      {state.submitError}
                    </p>
                  ) : null}
                  <FlowNav
                    canBack={currentIndex > 0}
                    canNext={canNext}
                    isContact={state.currentStep === "contact"}
                    isSubmitting={state.submitStatus === "submitting"}
                    total={total}
                    onBack={handleBack}
                    onNext={handleNext}
                  />
                </>
              ) : null}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
