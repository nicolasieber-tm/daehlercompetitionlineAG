"use server";

// Server Actions der Follow-ups-Seite (app/admin/follow-ups/page.tsx):
// Regel anlegen/bearbeiten/löschen, fällige Follow-ups jetzt senden. Siehe
// lib/admin/followups.ts und lib/followups/run.ts (runDueFollowUps), die
// hier wiederverwendet werden.
//
// runDueFollowUpsAction() ruft NICHT runDueFollowUps() direkt auf, sondern
// runFollowUpsWithLock() aus lib/followups/scheduler.ts (denselben
// Postgres-Advisory-Lock wie app/api/cron/follow-ups/route.ts und der
// interne Scheduler, siehe dort). Sonst könnte ein Admin-Klick parallel zu
// einem automatischen Scheduler-Tick laufen: ein von diesem Lauf
// fehlgeschlagener und zurückgesetzter Follow-up-Eintrag würde dann
// innerhalb von Sekunden erneut versucht (verbraucht Versuche unnötig
// schnell), obwohl claim_follow_up() einen doppelten *erfolgreichen*
// Versand weiterhin verhindert.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createRule,
  deleteOrDeactivateRule,
  updateRule,
  UnknownPlaceholderError,
  type FollowUpRuleInput,
} from "@/lib/admin/followups";
import type { RunDueFollowUpsResult } from "@/lib/followups/run";
import { runFollowUpsWithLock } from "@/lib/followups/scheduler";

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
    const outcome = await runFollowUpsWithLock();
    if (!outcome.ran) {
      // Der Lock ist gerade vom internen Scheduler oder einem anderen
      // manuellen Aufruf belegt (siehe Kommentar oben): nicht warten, nicht
      // stillschweigend nichts tun, sondern dem Admin eine klare Meldung
      // zurückgeben statt eines leeren Ergebnisses.
      return {
        ok: false,
        error: "Ein automatischer Lauf ist gerade aktiv. Bitte in Kürze erneut versuchen.",
      };
    }
    revalidatePath("/admin/follow-ups");
    return { ok: true, result: outcome.result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Senden fehlgeschlagen." };
  }
}
