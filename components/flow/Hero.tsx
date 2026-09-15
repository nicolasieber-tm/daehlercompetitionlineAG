"use client";

// Dunkles Hero-Band wie .band in docs/vorschau.html: Wortmarke, Titel,
// Meta-Box (Standort, Telefon, Antwortzeit), Sprachumschalter. Client
// Component (nicht Server), damit die Texte beim Sprachwechsel sofort
// mitziehen, siehe app/page.tsx.
import { LanguageSwitch } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";

export function Hero() {
  const { t } = useT();

  return (
    <div
      className="relative border-b border-line bg-bg bg-cover bg-[right_center]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--color-bg) 0%, rgba(18,21,22,.92) 45%, rgba(18,21,22,.35) 100%), " +
          "linear-gradient(0deg, var(--color-bg) 0%, transparent 40%), url(/img/flow/hero.jpg)",
      }}
    >
      <div className="mx-auto flex min-h-[360px] max-w-[1040px] flex-wrap items-end justify-between gap-7 px-4 py-9 sm:px-6">
        <div>
          <div className="font-display text-[30px] font-bold uppercase leading-none tracking-[0.04em]">
            {t.brand.name}
            <small className="mt-0.5 block text-[11px] font-semibold tracking-[0.22em] text-muted">
              {t.brand.tagline}
            </small>
          </div>
          <p className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
            {t.brand.eyebrow}
          </p>
          <h1 className="mt-2.5 text-balance font-display text-[clamp(30px,5vw,48px)] font-bold uppercase leading-[1.05]">
            {t.brand.title} <span className="text-red-bright">{t.brand.titleHighlight}</span>
          </h1>
          <p className="mt-3.5 max-w-[56ch] text-muted">{t.brand.lede}</p>
        </div>

        <div className="grid min-w-[240px] gap-1.5 border border-line bg-bg/70 p-3.5 text-[13px] text-muted backdrop-blur-xs">
          <div className="flex justify-between gap-4 border-b border-dashed border-line pb-1.5">
            <span>{t.brand.meta.locationLabel}</span>
            <b className="font-medium text-text">{t.brand.meta.location}</b>
          </div>
          <div className="flex justify-between gap-4 border-b border-dashed border-line pb-1.5">
            <span>{t.brand.meta.phoneLabel}</span>
            <b className="font-medium text-text">
              {/*
                Touch-Fläche ≥44px (Prüfbefund flow, Punkt 7): der Link selbst
                ist nur ein paar Textzeichen hoch. Statt ihn optisch zu
                vergrössern (würde die enge Meta-Box-Zeile verzerren), zieht
                py-4 -my-4 die Klickfläche unsichtbar über den Zeilenrand
                hinaus - kein Hintergrund/Rahmen am Link, daher ohne jede
                optische Änderung.
              */}
              <a
                href={`tel:${t.brand.meta.phone.replace(/\s+/g, "")}`}
                // py-4 (16px) auf beiden Seiten reicht bei 13px Schrift und
                // jeder üblichen Zeilenhöhe sicher über 44px Gesamthöhe,
                // -my-4 hebt die zusätzliche Fläche im Fluss wieder auf.
                className="inline-block -my-4 py-4 text-text hover:text-red-bright"
              >
                {t.brand.meta.phone}
              </a>
            </b>
          </div>
          <div className="flex justify-between gap-4">
            <span>{t.brand.meta.responseLabel}</span>
            <b className="font-medium text-text">{t.brand.meta.response}</b>
          </div>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-[1040px] justify-end px-4 pb-4 sm:px-6">
        <LanguageSwitch />
      </div>
    </div>
  );
}
