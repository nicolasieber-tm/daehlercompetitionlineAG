"use client";

// Admin-Shell: Seitenleiste mit Navigation (Aufgabenstellung: "Anfragen ·
// Preislisten · Modelle · Follow-ups · Schnellweg · Einstellungen ·
// Abmelden"), aktiver Link nach Pfad, Menü-Zähler "neu" auf Anfragen.
// Verlinkt auch Bereiche, die (noch) nicht von dieser Aufgabe gebaut werden
// (Preislisten, Modelle, Follow-ups, Schnellweg - andere Aufträge laut
// docs/architektur.md, Abschnitt "Ordnerstruktur"): die Navigation zeigt sie
// trotzdem vollständig, sie füllen sich unabhängig.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminUser } from "@/lib/admin/auth";
import { admin } from "@/lib/i18n/admin";
import { signOutAction } from "@/app/admin/actions/auth";
import { Button } from "@/components/ui";
import { ToastProvider } from "./Toast";

interface NavItem {
  href: string;
  label: string;
  /** Zusätzliches Pfad-Präfix, unter dem der Eintrag ebenfalls aktiv gilt (z.B. /admin/anfragen/[id] -> "Anfragen"). */
  matchPrefix?: string;
  badge?: number;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) return true;
  if (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)) return true;
  return false;
}

export function AdminShell({
  user,
  newCount,
  children,
}: {
  user: AdminUser;
  newCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Sidebar unter 800px (Breakpoint md2) eingeklappt, Hamburger-Button
  // öffnet sie als Overlay (Prüfbefund admin-shell, Punkt 4: "damit der
  // Inhalt auf dem Handy sofort sichtbar ist" - vorher stand die volle,
  // sechs Einträge lange Navigation als eigener Block über dem Inhalt,
  // musste auf dem Handy erst weggescrollt werden). Ab md2 ignoriert die CSS
  // (md2:flex/md2:hidden unten) diesen State komplett, die Sidebar ist dort
  // wie bisher permanent sichtbar.
  const [menuOpen, setMenuOpen] = useState(false);

  // Menü nach einem Seitenwechsel wieder einklappen, sonst bliebe es nach
  // einem Klick auf einen Nav-Link bis zum nächsten manuellen Zuklappen
  // offen (nur relevant unter md2, dort schaltet der Hamburger es sichtbar).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const nav: NavItem[] = [
    { href: "/admin", label: admin.nav.inquiries, matchPrefix: "/admin/anfragen", badge: newCount },
    { href: "/admin/preislisten", label: admin.nav.pricelists },
    { href: "/admin/modelle", label: admin.nav.models },
    { href: "/admin/uebersetzungen", label: admin.nav.translations },
    { href: "/admin/follow-ups", label: admin.nav.followups },
    { href: "/admin/schnellweg", label: admin.nav.quick },
    { href: "/admin/einstellungen", label: admin.nav.settings },
  ];

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col md2:flex-row">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:bg-red focus:px-3 focus:py-2 focus:text-white"
        >
          Zum Inhalt springen
        </a>
        <aside className="shrink-0 border-b border-line bg-panel md2:w-60 md2:border-b-0 md2:border-r">
          <div className="flex items-center justify-between gap-3 px-5 py-4 md2:block md2:py-5">
            <div>
              <div className="font-display text-lg font-bold uppercase tracking-wide text-text">
                <span className="text-red-bright">d</span>ÄHLer
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-dim">{admin.nav.brandSub}</div>
            </div>
            {/* Hamburger: nur unter md2 sichtbar, steuert Nav + Logout-Block unten per aria-expanded/aria-controls. */}
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="admin-mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-line text-text md2:hidden"
            >
              <span className="sr-only">{menuOpen ? admin.nav.menuClose : admin.nav.menuOpen}</span>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                {menuOpen ? (
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                ) : (
                  <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
          <div id="admin-mobile-nav" className={`${menuOpen ? "flex" : "hidden"} flex-col md2:flex`}>
            {/*
              Prüfbefund (Kunde): aktiver Menüpunkt hatte roten Hintergrund UND
              rote Schrift (Tailwinds .text-white griff nicht). Ursache: das
              globale `a { color: var(--color-red-bright); }` in
              app/globals.css liegt (Tailwind v4, `@import "tailwindcss"`)
              AUSSERHALB jedes @layer-Blocks - nach den CSS-Cascade-Layer-
              Regeln schlägt eine ungelayerte Regel IMMER eine gelayerte, egal
              wie hoch deren Spezifität ist (Tailwinds Utilities liegen alle
              in @layer utilities). .text-white/.text-muted auf einem <a>
              hatten dadurch nie eine Chance. app/globals.css gehört nicht zu
              den für diese Aufgabe zugewiesenen Dateien (nicht anfassen) -
              der Fix hier setzt die Linkfarbe daher über eine eigene,
              ebenfalls ungelayerte <style>-Regel mit einem Klassen-Selektor
              (.admin-nav-link, Spezifität 0-1-0), die die Typ-Selektor-Regel
              `a` (Spezifität 0-0-1) auch ungelayert zuverlässig schlägt -
              ganz ohne !important und ohne app/globals.css zu ändern.
              Kontrast (WCAG, gerechnet): Weiss #fff auf Rot #e21014 = 4.86:1,
              gedämpft #9aa3a5 auf Panel #1c2122 = 6.32:1, Text #f1f2f2 auf
              Panel-Alt (Hover) #22282a = 13.33:1 - alle ≥ 4.5:1.
            */}
            <style>{`
              .admin-nav-link { color: var(--color-muted); }
              .admin-nav-link:hover { color: var(--color-text); }
              .admin-nav-link[aria-current="page"] { color: var(--color-white); }
            `}</style>
            <nav aria-label={admin.nav.inquiries} className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
              {nav.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "admin-nav-link flex items-center justify-between rounded-[2px] px-3 py-2.5",
                      "font-display text-sm font-semibold uppercase tracking-[0.05em] transition-colors duration-150",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
                      active ? "bg-red" : "hover:bg-panel-alt",
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    {!!item.badge && (
                      <span
                        className={[
                          "ml-2 inline-flex min-w-[1.5em] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                          // Aktiv: weiss auf dunkel (statt weiss auf weiss/rot
                          // auf rot, siehe Kommentar oben) - dunkler Kreis
                          // hebt sich vom roten Zeilenhintergrund ab.
                          active ? "bg-bg text-white" : "bg-white text-red",
                        ].join(" ")}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-line px-3 py-4">
              <p className="truncate px-3 text-xs leading-relaxed text-dim">
                {admin.nav.loggedInAs}
                <br />
                <span className="text-muted">{user.email}</span>
              </p>
              <form action={signOutAction} className="mt-2">
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-3">
                  {admin.nav.logout}
                </Button>
              </form>
            </div>
          </div>
        </aside>
        {/* min-w-0: ohne das bleibt <main> als Flex-Item (flex-1) auf seine
            intrinsische Inhaltsbreite (Tabellen mit whitespace-nowrap-Spalten)
            begrenzt und weitet die Seite auf - overflow-x-auto der Tabelle
            (components/admin/Table.tsx) greift dann nie, es scrollt die ganze
            Seite statt nur der Tabellen-Container (Prüfbefund admin-shell,
            Punkt 3). */}
        <main id="admin-main" className="min-w-0 flex-1 px-4 py-6 md2:px-8 md2:py-8">
          <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-6">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
