"use client";

// Freitext-Feld für den Antwortentwurf (Betreff bleibt ein normales
// FormField-Input): wächst mit dem Inhalt statt zu scrollen, damit der
// gesamte Entwurf beim Bearbeiten sichtbar bleibt (siehe .mail textarea in
// docs/vorschau.html, dort mit fester Mindesthöhe).
import { useEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { minHeightPx?: number };

export function Textarea({ className = "", value, minHeightPx = 320, ...props }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
  }, [value, minHeightPx]);

  return (
    <textarea
      ref={ref}
      value={value}
      {...props}
      className={[
        "w-full resize-y rounded-[2px] border border-line-alt bg-bg px-3 py-3 text-sm leading-relaxed text-text",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
        className,
      ].join(" ")}
    />
  );
}
