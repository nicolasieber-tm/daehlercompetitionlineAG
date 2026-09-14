"use server";

// Server Actions der Follow-ups-Seite (app/admin/follow-ups/page.tsx):
// Regel anlegen/bearbeiten/löschen, fällige Follow-ups jetzt senden. Siehe
// lib/admin/followups.ts und lib/followups/run.ts (runDueFollowUps), die
// hier wiederverwendet werden.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createRule,
  deleteOrDeactivateRule,
  updateRule,
  UnknownPlaceholderError,
  type FollowUpRuleInput,
} from "@/lib/admin/followups";
import { runDueFollowUps, type RunDueFollowUpsResult } from "@/lib/followups/run";

export type ActionResult<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

function describeError(err: unknown, fallback: string): string {
  if (err instanceof UnknownPlaceholderError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

export async function createFollowUpRuleAction(input: FollowUpRuleInput): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  try {
    const id = await createRule(input);
    revalidatePath("/admin/follow-ups");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: describeError(err, "Regel anlegen fehlgeschlagen.") };
  }
}

export async function updateFollowUpRuleAction(id: string, input: FollowUpRuleInput): Promise<ActionResult> {
  await requireAdmin();
  try {
    await updateRule(id, input);
    revalidatePath("/admin/follow-ups");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err, "Regel speichern fehlgeschlagen.") };
  }
}

export async function deleteFollowUpRuleAction(id: string): Promise<ActionResult<{ deleted: boolean }>> {
  await requireAdmin();
  try {
    const result = await deleteOrDeactivateRule(id);
    revalidatePath("/admin/follow-ups");
    return { ok: true, deleted: result.deleted };
  } catch (err) {
    return { ok: false, error: describeError(err, "Löschen fehlgeschlagen.") };
  }
}

export async function runDueFollowUpsAction(): Promise<ActionResult<{ result: RunDueFollowUpsResult }>> {
  await requireAdmin();
  try {
    const result = await runDueFollowUps();
    revalidatePath("/admin/follow-ups");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Senden fehlgeschlagen." };
  }
}
