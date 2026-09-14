import { admin } from "@/lib/i18n/admin";
import type { MailInquiryContext } from "@/lib/mail/types";
import { Card } from "./Card";

/** Prüfhinweise als Checkliste (Aufgabenstellung): zum Abhaken bei der Prüfung, nichts wird gespeichert. */
export function ChecksList({ ctx }: { ctx: MailInquiryContext }) {
  const { checks } = ctx;

  return (
    <Card title={admin.detail.checks.title}>
      {checks.length === 0 ? (
        <p className="text-sm text-muted">{admin.detail.checks.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2.5 text-sm text-text">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-red"
                aria-label={check.text}
              />
              <span>{check.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
