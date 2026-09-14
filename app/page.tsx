"use client";

// Kleiner Schaukasten der UI-Bausteine aus components/ui. Wird in Phase C
// durch den eigentlichen Kundenflow (siehe docs/architektur.md) ersetzt.
import { useState } from "react";
import {
  BeforeAfter,
  Button,
  Chip,
  Field,
  LanguageSwitch,
  Progress,
  Question,
  StepLabel,
  Subtitle,
  Summary,
  Tile,
  Upsell,
} from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { chfFrom } from "@/lib/i18n/format";

export default function Home() {
  const { t, tf, locale } = useT();
  const [motorOn, setMotorOn] = useState(true);
  const [timing, setTiming] = useState(t.steps.timing.options[0].id);
  const [upsellAdded, setUpsellAdded] = useState(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-2xl font-bold uppercase tracking-[0.04em]">
            {t.brand.name}
            <small className="mt-0.5 block text-[11px] font-semibold tracking-[0.22em] text-muted">
              {t.brand.tagline}
            </small>
          </div>
        </div>
        <LanguageSwitch />
      </header>

      <section className="flex flex-col gap-4">
        <StepLabel>{t.steps.wish.label}</StepLabel>
        <Question>{t.steps.wish.question}</Question>
        <Subtitle>{t.steps.wish.subtitle}</Subtitle>
        <Progress total={6} current={1} />
      </section>

      <section className="grid grid-cols-1 gap-2.5 xs:grid-cols-2 md2:grid-cols-3">
        <Tile
          title={t.steps.wish.categories.motor.title}
          description={t.steps.wish.categories.motor.subtitle}
          price={motorOn ? tf(t.priceStatus.priced, { price: chfFrom(4180, locale) }) : undefined}
          selected={motorOn}
          onClick={() => setMotorOn((v) => !v)}
          badge={motorOn ? "✓" : undefined}
        />
        <Tile
          title={t.steps.wish.categories.auspuff.title}
          description={t.steps.wish.categories.auspuff.subtitle}
          price={tf(t.priceStatus.priced, { price: chfFrom(5260, locale) })}
        />
        <Tile
          title={t.steps.wish.categories.fahrwerk.title}
          description={t.steps.wish.categories.fahrwerk.subtitle}
          price={t.priceStatus.on_request}
          priceMuted
        />
      </section>

      <section className="flex flex-col gap-3">
        <StepLabel>{t.steps.timing.label}</StepLabel>
        <Question>{t.steps.timing.question}</Question>
        <div className="mt-1 flex flex-wrap gap-2">
          {t.steps.timing.options.map((option) => (
            <Chip key={option.id} active={timing === option.id} onClick={() => setTiming(option.id)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Field label={t.steps.contact.firstName} inputProps={{ defaultValue: "Max" }} />
        <Field
          as="select"
          label={t.steps.car.yearLabel}
          inputProps={{ defaultValue: "2025" }}
        >
          {["2026", "2025", "2024", t.steps.car.yearOlder].map((year) => (
            <option key={year}>{year}</option>
          ))}
        </Field>
      </section>

      <Upsell
        title={t.steps.category.upsell.motor.title}
        text={t.steps.category.upsell.motor.text}
        added={upsellAdded}
        ctaLabel={upsellAdded ? t.steps.category.upsellAdded.remove : t.steps.category.upsellAdd}
        onCta={() => setUpsellAdded((v) => !v)}
      />

      <Summary
        header={t.steps.done.package.header}
        headerMeta="M3 Touring G81"
        lines={[
          { key: "motor", category: "Motor", name: "Stufe 1", price: chfFrom(4180, locale) },
          { key: "auspuff", category: "Auspuff", name: "Komplettanlage", price: chfFrom(5260, locale) },
        ]}
        totalLabel={t.steps.done.package.total}
        totalValue={chfFrom(9440, locale)}
      />

      <BeforeAfter
        beforeLabel={t.steps.done.beforeAfter.before}
        afterLabel={t.steps.done.beforeAfter.after}
        rows={[
          {
            key: "leistung",
            category: t.steps.done.beforeAfter.rows.leistung,
            before: "530 PS",
            after: "640 PS",
          },
          {
            key: "sound",
            category: t.steps.done.beforeAfter.rows.sound,
            before: t.steps.done.beforeAfter.seriesValue,
            after: "Komplettanlage",
          },
        ]}
      />

      <div className="flex flex-wrap gap-3">
        <Button variant="ghost">{t.nav.back}</Button>
        <Button variant="line">{t.nav.next}</Button>
        <Button variant="primary">{t.nav.submit}</Button>
      </div>
    </main>
  );
}
