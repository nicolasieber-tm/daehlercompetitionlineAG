"use client";

// Schritt "Termin und Kontakt": Zeitraum-Chips, Kontaktfelder, Kanal-Chips,
// Datenschutz-Checkbox, Inline-Validierung. Siehe docs/vorschau.html
// viewContact() und CLAUDE.md Kundenflow Punkt 5.
import type { Dispatch } from "react";
import { Chip, Field, Question, StepLabel } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";
import type { Channel, Timing } from "@/lib/supabase/rows";
import type { ContactFields, FlowAction, FlowState } from "../state";
import { vehicleDisplayName } from "../vehicleLabel";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactFieldError(
  field: keyof ContactFields,
  value: string,
  t: ReturnType<typeof useT>["t"],
): string | null {
  if (value.trim().length === 0) return t.errors.required;
  if (field === "email" && !EMAIL_PATTERN.test(value.trim())) return t.errors.invalidEmail;
  return null;
}

export function isContactValid(state: FlowState, t: ReturnType<typeof useT>["t"]): boolean {
  const fields: (keyof ContactFields)[] = ["firstName", "lastName", "city", "phone", "email"];
  const hasFieldError = fields.some((f) => contactFieldError(f, state.contact[f], t) !== null);
  return !hasFieldError && state.privacyAccepted;
}

export function ContactStep({
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

  function showError(field: keyof ContactFields): string | null {
    const shouldShow = !!state.contactTouched[field] || state.submitAttempted;
    if (!shouldShow) return null;
    return contactFieldError(field, state.contact[field], t);
  }

  const showPrivacyError = (!!state.contactTouched.privacy || state.submitAttempted) && !state.privacyAccepted;

  function field(name: keyof ContactFields, label: string, type = "text") {
    const error = showError(name);
    return (
      <div className="flex flex-col gap-1.5">
        <Field
          label={label}
          inputProps={{
            type,
            value: state.contact[name],
            onChange: (e) => dispatch({ type: "SET_CONTACT_FIELD", field: name, value: e.target.value }),
            onBlur: () => dispatch({ type: "TOUCH_CONTACT_FIELD", field: name }),
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error ? `${name}-error` : undefined,
          }}
        />
        {error ? (
          <p id={`${name}-error`} className="text-[13px] text-warn">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <StepLabel>{t.steps.timing.label}</StepLabel>
      <Question>{t.steps.timing.question}</Question>
      <div className="mt-5 flex flex-wrap gap-2">
        {t.steps.timing.options.map((option) => (
          <Chip
            key={option.id}
            active={state.timing === option.id}
            onClick={() => dispatch({ type: "SET_TIMING", timing: option.id as Timing })}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="mt-8 mb-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
        {t.steps.contact.label}
      </div>
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
        {field("firstName", t.steps.contact.firstName)}
        {field("lastName", t.steps.contact.lastName)}
        {field("city", t.steps.contact.city)}
        {field("phone", t.steps.contact.phone, "tel")}
        <div className="xs:col-span-2">{field("email", t.steps.contact.email, "email")}</div>
      </div>

      <div className="mt-6 mb-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
        {t.steps.contact.channelLabel}
      </div>
      <div className="flex flex-wrap gap-2">
        {t.steps.contact.channels.map((option) => (
          <Chip
            key={option.id}
            active={state.channel === option.id}
            onClick={() => dispatch({ type: "SET_CHANNEL", channel: option.id as Channel })}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-1.5">
        <label className="flex items-start gap-2.5 text-[13px] text-dim">
          <input
            type="checkbox"
            checked={state.privacyAccepted}
            onChange={(e) => dispatch({ type: "SET_PRIVACY", value: e.target.checked })}
            onBlur={() => dispatch({ type: "TOUCH_CONTACT_FIELD", field: "privacy" })}
            aria-invalid={showPrivacyError ? true : undefined}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-red"
          />
          <span>
            {tf(t.steps.contact.privacyNote, { model: family ? vehicleDisplayName(family, model) : "" })}
          </span>
        </label>
        {showPrivacyError ? <p className="text-[13px] text-warn">{t.errors.privacyRequired}</p> : null}
      </div>
    </div>
  );
}
