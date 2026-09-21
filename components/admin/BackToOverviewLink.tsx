"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { admin } from "@/lib/i18n/admin";

// Zurück-Link zuoberst auf der Anfrage-Detailseite. Filter und Seite der
// Übersicht stehen in den URL-Suchparametern (app/admin/page.tsx): die
// Übersicht merkt sich ihre letzte URL (rememberOverviewHref(), aufgerufen
// aus LiveRefresh.tsx), der Link führt dorthin zurück statt auf die
// ungefilterte erste Seite. Ohne gemerkte URL (Direkteinstieg über die
// Anfrage-Mail, neuer Tab) bleibt es bei /admin.
const STORAGE_KEY = "admin:overviewHref";
const OVERVIEW_PATH = "/admin";

export function rememberOverviewHref(search: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, search ? `${OVERVIEW_PATH}?${search}` : OVERVIEW_PATH);
  } catch {
    // sessionStorage gesperrt (privates Fenster): Link bleibt bei /admin.
  }
}

export function BackToOverviewLink() {
  const [href, setHref] = useState(OVERVIEW_PATH);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored && (stored === OVERVIEW_PATH || stored.startsWith(`${OVERVIEW_PATH}?`))) setHref(stored);
    } catch {
      // siehe rememberOverviewHref()
    }
  }, []);

  return (
    <Link href={href} className="-mb-2 inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-text">
      <span aria-hidden="true">←</span>
      {admin.detail.backToOverview}
    </Link>
  );
}
