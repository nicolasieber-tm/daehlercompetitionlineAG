import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "line";
type ButtonSize = "md" | "sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-red text-white hover:bg-red-bright disabled:bg-line-alt disabled:text-dim disabled:cursor-not-allowed",
  ghost: "bg-transparent text-muted pl-0 hover:text-text hover:bg-transparent",
  line: "bg-transparent border border-line-alt text-text hover:border-red-bright hover:bg-red-soft",
};

// Grössen-Varianten statt className-Überschreibung: eine Tailwind-Klasse
// (z.B. px-[22px]) kann eine andere für dieselbe Eigenschaft nicht
// zuverlässig überschreiben, die Reihenfolge im generierten CSS entscheidet,
// nicht die Reihenfolge in der className-Zeichenkette. Wer kompakter
// braucht (z.B. Upsell), wählt size="sm" statt className zu überschreiben.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-[22px] py-[13px] text-base",
  sm: "px-4 py-2.5 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

/** Primärer Button wie .btn in der Vorschau: rot, uppercase, Display-Font. */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "inline-flex items-center gap-2.5 rounded-[2px]",
        "font-display font-bold uppercase tracking-[0.1em]",
        "transition-colors duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
