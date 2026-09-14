"use client";

// Clipboard-Button, verwendet vom Zusammenfassung-Ticket (SummaryBlock.tsx)
// und vom Antwortentwurf (DraftEditor.tsx: "Kopieren" = Clipboard mit
// Betreff und Text, siehe Aufgabenstellung).
import { useTransition } from "react";
import { Button } from "@/components/ui";
import type { ButtonProps } from "@/components/ui";
import { useToast } from "./Toast";

export interface CopyButtonProps {
  text: string;
  label: string;
  copiedMessage: string;
  failedMessage: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export function CopyButton({ text, label, copiedMessage, failedMessage, size = "sm", variant = "line" }: CopyButtonProps) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard API nicht verfügbar.");
        }
        await navigator.clipboard.writeText(text);
        showToast(copiedMessage, "success");
      } catch {
        showToast(failedMessage, "error");
      }
    });
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={handleClick} disabled={pending}>
      {label}
    </Button>
  );
}
