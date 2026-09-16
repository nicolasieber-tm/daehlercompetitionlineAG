import { admin } from "@/lib/i18n/admin";
import type { InquiryStatus } from "@/lib/db/rows";

const COLORS: Record<InquiryStatus, string> = {
  neu: "border-red-bright text-red-bright bg-red-soft",
  in_bearbeitung: "border-warn text-warn bg-[rgba(226,168,60,.14)]",
  beantwortet: "border-ok text-ok bg-[rgba(61,190,122,.14)]",
  abgeschlossen: "border-line-alt text-muted bg-transparent",
};

/** Status-Pille wie die Pills in docs/vorschau.html .intern h3 .pill, in den vier Anfrage-Status-Farben. */
export function StatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1",
        "font-display text-[11px] font-semibold uppercase tracking-[0.08em]",
        COLORS[status],
      ].join(" ")}
    >
      {admin.status[status]}
    </span>
  );
}
