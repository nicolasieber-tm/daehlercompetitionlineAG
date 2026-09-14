"use client";

// Schritt 2 "Ihr Wunsch": 6 Foto-Kacheln (Kategorien) + Upsell-Kachel
// "Komplettpaket, beraten Sie mich". Siehe docs/vorschau.html viewWish()
// und CLAUDE.md Kundenflow Punkt 2.
import type { Dispatch } from "react";
import { Button, Question, StepLabel, Subtitle, Tile } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { FLOW_CATEGORIES } from "@/lib/supabase/rows";
import type { FlowAction, FlowState } from "../state";

export function WishStep({ state, dispatch }: { state: FlowState; dispatch: Dispatch<FlowAction> }) {
  const { t } = useT();

  return (
    <div>
      <StepLabel>{t.steps.wish.label}</StepLabel>
      <Question>{t.steps.wish.question}</Question>
      <Subtitle>{t.steps.wish.subtitle}</Subtitle>

      <div className="mt-5 grid grid-cols-1 gap-2.5 xs:grid-cols-2 md2:grid-cols-3">
        {FLOW_CATEGORIES.map((c) => (
          <Tile
            key={c}
            title={t.steps.wish.categories[c].title}
            description={t.steps.wish.categories[c].subtitle}
            imageUrl={`/img/flow/cat_${c}.jpg`}
            selected={state.categories.includes(c)}
            onClick={() => dispatch({ type: "TOGGLE_CATEGORY", category: c })}
          />
        ))}
      </div>

      <div
        className={[
          "mt-3 flex flex-wrap items-center justify-between gap-4 border bg-panel px-4 py-3.5",
          state.consulting ? "border-solid border-ok" : "border-dashed border-line-alt",
        ].join(" ")}
      >
        <div className="flex flex-col gap-0.5">
          <b className="font-display text-[17px] font-semibold uppercase tracking-[0.06em]">
            {t.steps.wish.completePackage.title}
          </b>
          <span className="text-[13px] text-muted">{t.steps.wish.completePackage.subtitle}</span>
        </div>
        <Button
          variant={state.consulting ? "ghost" : "line"}
          size="sm"
          aria-pressed={state.consulting}
          onClick={() => dispatch({ type: "SET_CONSULTING", value: !state.consulting })}
        >
          {state.consulting ? t.steps.wish.completePackage.selected : t.steps.wish.completePackage.cta}
        </Button>
      </div>
    </div>
  );
}
