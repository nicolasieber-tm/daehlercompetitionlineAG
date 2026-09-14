"use client";

// Regeln-Tabelle mit «Neue Regel»/«Bearbeiten» (öffnet FollowUpRuleForm
// inline) und «Löschen» (löscht nur ohne offene follow_ups, sonst
// deaktiviert, siehe lib/admin/followups.ts deleteOrDeactivateRule()).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import type { FollowUpRuleRow } from "@/lib/admin/followups";
import { deleteFollowUpRuleAction } from "@/app/admin/actions/followups";
import { Button } from "@/components/ui";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { Card } from "./Card";
import { Table, TableHead, TableBody, Th, Td } from "./Table";
import { FollowUpRuleForm } from "./FollowUpRuleForm";

const t = admin.followups.table;

export function FollowUpRulesManager({ rules }: { rules: FollowUpRuleRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<FollowUpRuleRow | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<FollowUpRuleRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSaved() {
    setEditing(null);
    router.refresh();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteFollowUpRuleAction(target.id);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(result.deleted ? t.deleted : t.deactivated, result.deleted ? "success" : "error");
      router.refresh();
    });
  }

  return (
    <Card
      title={admin.followups.title}
      actions={
        editing === null && (
          <Button type="button" variant="line" size="sm" onClick={() => setEditing("new")}>
            {t.new}
          </Button>
        )
      }
    >
      {editing !== null ? (
        <FollowUpRuleForm rule={editing === "new" ? null : editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{t.columns.name}</Th>
            <Th>{t.columns.days}</Th>
            <Th>{t.columns.maxCount}</Th>
            <Th>{t.columns.active}</Th>
            <Th />
          </TableHead>
          <TableBody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td className="font-semibold">{r.name}</Td>
                <Td>{r.daysAfterReply}</Td>
                <Td>{r.maxCount}</Td>
                <Td>{r.active ? admin.common.yes : admin.common.no}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="line" size="sm" onClick={() => setEditing(r)}>
                      {t.edit}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setDeleteTarget(r)}>
                      {t.delete}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t.deleteConfirmTitle}
        confirmLabel={t.delete}
        pending={pending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        {t.deleteConfirmBody}
      </ConfirmDialog>
    </Card>
  );
}
