"use client";

// Schritt "Der Charakter": 3 Bild-Kacheln + optionales Textfeld. Siehe
// docs/vorschau.html viewChar() (Bilder: cat_interieur, cat_auspuff,
// char_max, siehe Aufgabenstellung) und CLAUDE.md Kundenflow Punkt 4.
import type { Dispatch } from "react";
import { Field, Question, StepLabel, Tile } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";
import type { Character } from "@/lib/supabase/rows";
import type { FlowAction, FlowState } from "../state";
import { vehicleDisplayName } from "../vehicleLabel";

const CHARACTER_IMAGES = ["/img/flow/cat_interieur.jpg", "/img/flow/cat_auspuff.jpg", "/img/flow/char_max.jpg"];

export function CharacterStep({
  family,
  model,
  state,
  dispatch,
}: {
  family: CatalogFamily | null;
  model: CatalogModel | null;
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}) {
  const { t, tf } = useT();

  return (
    <div>
      <StepLabel>{t.steps.character.label}</StepLabel>
      <Question>
        {tf(t.steps.character.question, { model: family ? vehicleDisplayName(family, model) : "" })}
      </Question>

      <div className="mt-5 grid grid-cols-1 gap-2.5 xs:grid-cols-2 md2:grid-cols-3">
        {t.steps.character.options.map((option, i) => (
          <Tile
            key={option.id}
            title={option.title}
            description={option.description}
            imageUrl={CHARACTER_IMAGES[i]}
            tall
            selected={state.character === option.id}
            onClick={() => dispatch({ type: "SET_CHARACTER", character: option.id as Character })}
          />
        ))}
      </div>

      <div className="mt-6">
        <Field
          as="textarea"
          label={t.steps.character.noteLabel}
          inputProps={{
            rows: 3,
            placeholder: t.steps.character.notePlaceholder,
            value: state.message,
            onChange: (e) => dispatch({ type: "SET_MESSAGE", message: e.target.value }),
          }}
        />
      </div>
    </div>
  );
}
