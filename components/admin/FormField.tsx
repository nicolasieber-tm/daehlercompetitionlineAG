import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Form-Baustein für den Admin: wie components/ui/Field.tsx, aber dichter
// (kleinere Schrift/Padding, siehe docs/architektur.md "Admin: gleiches
// Farbsystem wie der Flow, dichter") und mit optionalem Hilfetext
// (Einstellungen-Seite).
const CONTROL_CLASSES =
  "w-full rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text placeholder:text-dim " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2";

const SELECT_CLASSES =
  "appearance-none bg-[length:5px_5px] bg-no-repeat " +
  "bg-[position:calc(100%-14px)_50%,calc(100%-9px)_50%] " +
  "bg-[linear-gradient(45deg,transparent_50%,var(--color-muted)_50%),linear-gradient(135deg,var(--color-muted)_50%,transparent_50%)]";

type BaseProps = {
  label: string;
  id?: string;
  help?: string;
};

type InputFieldProps = BaseProps & {
  as?: "input";
  inputProps: InputHTMLAttributes<HTMLInputElement>;
};

type SelectFieldProps = BaseProps & {
  as: "select";
  inputProps: SelectHTMLAttributes<HTMLSelectElement>;
  children: ReactNode;
};

type TextareaFieldProps = BaseProps & {
  as: "textarea";
  inputProps: TextareaHTMLAttributes<HTMLTextAreaElement>;
};

export type FormFieldProps = InputFieldProps | SelectFieldProps | TextareaFieldProps;

/** Formularfeld mit Label, dichter als components/ui/Field.tsx: Selects/Inputs/Textareas mit Hilfetext. */
export function FormField(props: FormFieldProps) {
  const { label, id: idProp, help } = props;
  const generatedId = useId();
  const id = idProp ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </label>
      {props.as === "select" ? (
        <select id={id} {...props.inputProps} className={[CONTROL_CLASSES, SELECT_CLASSES].join(" ")}>
          {props.children}
        </select>
      ) : props.as === "textarea" ? (
        <textarea id={id} {...props.inputProps} className={CONTROL_CLASSES} />
      ) : (
        <input id={id} {...props.inputProps} className={CONTROL_CLASSES} />
      )}
      {help && <p className="text-xs leading-relaxed text-dim">{help}</p>}
    </div>
  );
}
