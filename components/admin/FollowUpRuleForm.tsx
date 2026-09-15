"use client";

// Formular «Regel anlegen/bearbeiten» (Posten 6): Betreff/Text mit
// Platzhaltern {{vorname}} {{name}} {{fahrzeug}} {{nummer}}, Vorschau mit
// Beispielwerten, Validierung über renderTemplate() (lib/followups/
// placeholders.ts) - unbekannte Platzhalter blockieren das Speichern.
import { useMemo, useState, useTransition } from "react";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { renderTemplate } from "@/lib/followups/placeholders";
import type { FollowUpRuleInput, FollowUpRuleRow } from "@/lib/admin/followups";
import { createFollowUpRuleAction, updateFollowUpRuleAction } from "@/app/admin/actions/followups";
import { Button } from "@/components/ui";
import { FormField } from "./FormField";
import { useToast } from "./Toast";

const t = admin.followups.form;

const EXAMPLE_VARS = {
  vorname: "Max",
  name: "Muster",
  fahrzeug: "BMW M2 G87, M2",
  nummer: "2026-0001",
};

export function FollowUpRuleForm({
  rule,
  onSaved,
  onCancel,
}: {
  rule: FollowUpRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(rule?.name ?? "");
  const [daysAfterReply, setDaysAfterReply] = useState(String(rule?.daysAfterReply ?? 14));
  const [maxCount, setMaxCount] = useState(String(rule?.maxCount ?? 1));
  const [subject, setSubject] = useState(rule?.subject ?? "");
  const [body, setBody] = useState(rule?.body ?? "");
  const [sort, setSort] = useState(String(rule?.sort ?? 0));
  const [active, setActive] = useState(rule?.active ?? true);
  const [pending, startTransition] = useTransition();

  const subjectRender = useMemo(() => renderTemplate(subject, EXAMPLE_VARS), [subject]);
  const bodyRender = useMemo(() => renderTemplate(body, EXAMPLE_VARS), [body]);
  const unknownPlaceholders = useMemo(
    () => [...new Set([...subjectRender.unknownPlaceholders, ...bodyRender.unknownPlaceholders])],
    [subjectRender, bodyRender],
  );

  function handleSubmit() {
    if (unknownPlaceholders.length > 0) {
      showToast(tf(t.unknownPlaceholder, { placeholder: unknownPlaceholders.join(", ") }), "error");
      return;
    }
    if (!name.trim() || !subject.trim() || !body.trim()) {
      showToast("Name, Betreff und Text dürfen nicht leer sein.", "error");
      return;
    }

    const input: FollowUpRuleInput = {
      name: name.trim(),
      daysAfterReply: Number.parseInt(daysAfterReply, 10) || 0,
      subject: subject.trim(),
      body: body.trim(),
      maxCount: Math.max(1, Number.parseInt(maxCount, 10) || 1),
      active,
      sort: Number.parseInt(sort, 10) || 0,
    };

    startTransition(async () => {
      const result = rule ? await updateFollowUpRuleAction(rule.id, input) : await createFollowUpRuleAction(input);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(t.saved, "success");
      onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-4 border border-line-alt bg-bg p-4">
      <h3 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-text">
        {rule ? t.titleEdit : t.titleNew}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.name} inputProps={{ value: name, onChange: (e) => setName(e.target.value), maxLength: 120 }} />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label={t.daysAfterReply}
            inputProps={{
              type: "number",
              min: 1,
              max: 365,
              value: daysAfterReply,
              onChange: (e) => setDaysAfterReply(e.target.value),
            }}
          />
          <FormField
            label={t.maxCount}
            inputProps={{ type: "number", min: 1, max: 10, value: maxCount, onChange: (e) => setMaxCount(e.target.value) }}
          />
        </div>
      </div>

      <p className="text-xs text-dim">{t.placeholdersHint}</p>

      <FormField label={t.subject} inputProps={{ value: subject, onChange: (e) => setSubject(e.target.value), maxLength: 200 }} />
      <FormField
        label={t.body}
        as="textarea"
        inputProps={{ value: body, onChange: (e) => setBody(e.target.value), rows: 6 }}
      />

      {unknownPlaceholders.length > 0 && (
        <p className="text-sm text-red-bright">{tf(t.unknownPlaceholder, { placeholder: unknownPlaceholders.join(", ") })}</p>
      )}

      <div className="border border-line-alt bg-panel-alt p-3">
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{t.previewTitle}</h4>
        <p className="mt-2 text-sm text-text">
          <span className="text-dim">{t.previewSubject}: </span>
          {subjectRender.text || "-"}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text">
          <span className="text-dim">{t.previewBody}: </span>
          {bodyRender.text || "-"}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-32">
          <FormField label={t.sort} inputProps={{ type: "number", value: sort, onChange: (e) => setSort(e.target.value) }} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-text">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          {t.active}
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="button" size="sm" disabled={pending} onClick={handleSubmit}>
          {t.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
