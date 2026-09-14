import { admin } from "@/lib/i18n/admin";
import { Card } from "./Card";
import { CopyButton } from "./CopyButton";

/** Klartext-Zusammenfassung (lib/inquiry/summary.ts buildSummaryText()) als Monospace-Block, wie das Ticket in docs/vorschau.html (.ticket). */
export function SummaryBlock({ text }: { text: string }) {
  return (
    <Card
      title={admin.detail.summary.title}
      actions={
        <CopyButton
          text={text}
          label={admin.detail.summary.copy}
          copiedMessage={admin.detail.summary.copied}
          failedMessage={admin.detail.draft.copyFailed}
        />
      }
    >
      <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-line bg-bg p-4 font-mono text-[13px] leading-relaxed text-text">
        {text}
      </pre>
    </Card>
  );
}
