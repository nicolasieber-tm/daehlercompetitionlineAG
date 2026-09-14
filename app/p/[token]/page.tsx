// Read-only Ansicht einer geteilten Anfrage ("Paket als Link teilen", siehe
// CLAUDE.md Kundenflow Schritt 6 und docs/architektur.md Abschnitt
// "Kundenflow"). Server Component, kein Login nötig (Token = Zugriffs-
// kontrolle, siehe lib/inquiry/share.ts). noindex, 404 bei unbekanntem Token.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BeforeAfter, Summary } from "@/components/ui";
import { getInquiryByShareToken } from "@/lib/inquiry/share";
import { getDictionary, isLocale, tf } from "@/lib/i18n/dictionaries";
import { chfFrom } from "@/lib/i18n/format";
import { buildBeforeAfterRows } from "@/components/flow/beforeAfter";
import type { FlowCategory } from "@/lib/supabase/rows";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedInquiryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inquiry = await getInquiryByShareToken(token);
  if (!inquiry) notFound();

  const locale = isLocale(inquiry.locale) ? inquiry.locale : "de";
  const t = getDictionary(locale);
  const categories = inquiry.categories as FlowCategory[];

  const unpriced = inquiry.items.some((i) => i.priceStatus !== "priced");
  const totalLabel = unpriced ? t.steps.done.package.totalWithOnRequest : t.steps.done.package.total;
  const totalValue = inquiry.estimatedTotal != null ? chfFrom(inquiry.estimatedTotal, locale) : t.steps.done.package.onRequest;

  const summaryLines = categories.flatMap((c) => {
    const items = inquiry.items.filter((i) => i.category === c);
    if (items.length === 0) {
      return [
        {
          key: c,
          category: t.steps.wish.categories[c]?.title ?? c,
          name: t.steps.done.package.categoryAdviceLine,
          price: "–",
        },
      ];
    }
    return items.map((p, i) => ({
      key: `${c}-${i}`,
      category: t.steps.wish.categories[c]?.title ?? c,
      name: p.name,
      price:
        p.priceStatus === "priced" && p.priceTotal != null
          ? tf(t.priceStatus.priced, { price: chfFrom(p.priceTotal, locale) })
          : p.priceStatus === "in_preparation"
            ? t.priceStatus.in_preparation
            : t.priceStatus.on_request,
    }));
  });
  if (inquiry.consulting) {
    summaryLines.push({ key: "consulting", category: t.steps.wish.completePackage.title, name: t.steps.done.package.adviceLine, price: "–" });
  }

  const beforeAfterRows = buildBeforeAfterRows(
    {
      categories,
      items: inquiry.items.map((i) => ({ category: i.category as FlowCategory, name: i.name })),
      consulting: inquiry.consulting,
      character: inquiry.character,
    },
    t,
  );

  return (
    <main className="min-h-screen bg-bg px-4 py-10 text-text sm:px-6">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6">
        <div>
          <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
            {t.brand.name} {t.brand.tagline}
          </span>
          <h1 className="mt-2 text-balance font-display text-3xl font-bold uppercase tracking-wide">
            {t.steps.done.package.header}: {inquiry.vehicleLabel}
          </h1>
          {inquiry.firstName ? (
            <p className="mt-2 max-w-[58ch] text-muted">
              {tf(t.steps.done.title, { first: inquiry.firstName })}
            </p>
          ) : null}
        </div>

        <BeforeAfter beforeLabel={t.steps.done.beforeAfter.before} afterLabel={t.steps.done.beforeAfter.after} rows={beforeAfterRows} />

        <Summary
          header={t.steps.done.package.header}
          headerMeta={`${inquiry.vehicleLabel}${inquiry.year ? " · " + inquiry.year : ""}`}
          lines={summaryLines}
          totalLabel={totalLabel}
          totalValue={totalValue}
        />

        <p className="text-[13px] text-dim">{t.mail.reply.footer}</p>

        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-[2px] bg-red px-[22px] py-[13px] font-display text-base font-bold uppercase tracking-[0.1em] text-white transition-colors duration-150 hover:bg-red-bright"
          >
            {t.steps.done.ownRequest}
          </Link>
        </div>
      </div>
    </main>
  );
}
