"use client";

// Navigation Zurück/Weiter mit "Bisher CHF x", siehe docs/vorschau.html
// .nav und CLAUDE.md Kundenflow. Sticky unten unter 480px (Touch-Ziele).
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { chfPrice } from "@/lib/i18n/format";

export function FlowNav({
  canBack,
  canNext,
  isContact,
  isSubmitting,
  total,
  totalFrom,
  onBack,
  onNext,
}: {
  canBack: boolean;
  canNext: boolean;
  isContact: boolean;
  isSubmitting: boolean;
  total: number | null;
  /** «ab» vor der Summe, wenn eine Position laut Excel «ab» ist. */
  totalFrom: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t, tf, locale } = useT();

  return (
    <div className="sticky bottom-0 z-10 mt-8 border-t border-line bg-bg-alt/95 px-1 py-3 backdrop-blur xs:static xs:bg-transparent xs:px-0 xs:py-5 xs:backdrop-blur-none">
      {/* Unter 480px (xs) eigene Zeile über den Buttons, ab 480px inline neben
          "Weiter" (siehe unten) - auf dem Handy, dem Hauptgerät, muss die
          Richtsumme in jedem Schritt sichtbar sein (docs/vorschau.html .nav
          .basket zeigt sie ohne Breakpoint-Ausblendung). */}
      {total != null ? (
        <div className="mb-2 font-mono text-[13px] text-muted xs:hidden">
          {tf(t.nav.soFar, { price: chfPrice(total, locale, totalFrom) })}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div>
          {canBack ? (
            <Button variant="ghost" onClick={onBack}>
              ← {t.nav.back}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-4.5">
          {total != null ? (
            <span className="hidden font-mono text-[13px] text-muted xs:inline">
              {tf(t.nav.soFar, { price: chfPrice(total, locale, totalFrom) })}
            </span>
          ) : null}
          {/* Minor-Befund "Enter im Kontaktformular": im Schritt "contact"
              ist dies der einzige Button in der <form> mit type="submit" -
              Enter in einem der Textfelder (Vorname, Ort, ...) löst damit
              die native Formular-Submit-Auslösung aus (siehe Flow.tsx
              handleFormSubmit), statt spurlos zu verpuffen. onClick bleibt
              hier bewusst weg: ein type="submit"-Button innerhalb der
              <form> löst den Submit schon selbst aus, ein zusätzliches
              onClick würde handleNext() ein zweites Mal aufrufen (doppelter
              POST). Auf allen anderen Schritten bleibt der Button
              type="button" mit explizitem onClick, wie zuvor. */}
          <Button
            variant="primary"
            type={isContact ? "submit" : "button"}
            disabled={!canNext || isSubmitting}
            onClick={isContact ? undefined : onNext}
          >
            {isContact ? t.nav.submit : t.nav.next} →
          </Button>
        </div>
      </div>
    </div>
  );
}
