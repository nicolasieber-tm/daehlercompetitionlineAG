import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const CONTROL_CLASSES =
  "w-full rounded-[2px] border border-line-alt bg-panel px-3 py-[11px] text-base text-text placeholder:text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2";

const SELECT_CLASSES =
  "appearance-none bg-[length:5px_5px] bg-no-repeat " +
  "bg-[position:calc(100%-18px)_50%,calc(100%-13px)_50%] " +
  "bg-[linear-gradient(45deg,transparent_50%,var(--color-muted)_50%),linear-gradient(135deg,var(--color-muted)_50%,transparent_50%)]";

type BaseProps = {
  label: string;
  /** Überschreibt die generierte id, falls ein Aufrufer eine feste id braucht. */
  id?: string;
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

export type FieldProps = InputFieldProps | SelectFieldProps | TextareaFieldProps;

/** Formularfeld mit Label wie .field in der Vorschau: Label uppercase, Kontrolle in Panel-Optik. */
export function Field(props: FieldProps) {
  const { label, id: idProp } = props;
  const generatedId = useId();
  const id = idProp ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted"
      >
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
    </div>
  );
}
