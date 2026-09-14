"use client";

// Einstellungen-Formular: alle settings-Schlüssel, Speichern per Server
// Action (Aufgabenstellung). Unkontrollierte Inputs (uncontrolled, via
// FormData) statt useState je Feld: acht einfache Textfelder ohne
// Live-Validierung brauchen keinen kontrollierten State, FormData ist hier
// weniger Code und näher am zugrunde liegenden <form>.
import { useRef, useState, useTransition } from "react";
import { admin } from "@/lib/i18n/admin";
import { Button } from "@/components/ui";
import { saveSettingsAction } from "@/app/admin/actions/settings";
import { SETTINGS_KEYS } from "@/lib/admin/settings";
import { FormField } from "./FormField";
import { useToast } from "./Toast";

export function SettingsForm({ values }: { values: Record<string, string> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    for (const key of SETTINGS_KEYS) {
      payload[key] = String(formData.get(key) ?? "");
    }
    startTransition(async () => {
      const result = await saveSettingsAction(payload);
      if (result.ok) {
        showToast(admin.settings.saved, "success");
      } else {
        setError(result.error);
        showToast(result.error, "error");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
      {SETTINGS_KEYS.map((key) => (
        <FormField
          key={key}
          label={admin.settings.fields[key].label}
          help={admin.settings.fields[key].help}
          inputProps={{ name: key, defaultValue: values[key] ?? "", disabled: pending }}
        />
      ))}

      {error && (
        <p role="alert" className="text-sm text-red-bright">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {admin.settings.save}
        </Button>
      </div>
    </form>
  );
}
