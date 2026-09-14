// GET /api/catalog: öffentlicher Katalog (aktive Familien mit aktiven
// Modellen) für den Kundenflow. Siehe docs/architektur.md, Abschnitt
// "Kundenflow", und lib/catalog/queries.ts.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFamilies } from "@/lib/catalog/queries";

// Kein next/cache-unstable_cache mehr (Befund #3, Bericht): der Next-
// Datencache wurde nur von lib/pricelist/imports.ts (applyPendingImport)
// per revalidateTag('catalog') invalidiert, nicht aber vom CLI-Import
// (scripts/import-pricelists.ts, ausserhalb von Next) oder von Admin-Routen,
// die einzelne Felder pflegen (Foto, Kurzbeschrieb, Serien-PS) - dadurch
// konnte der öffentliche Katalog bis zu revalidate-Sekunden veraltete Werte
// ausliefern, ohne dass eine Schreibstelle das sichtbar gemacht hätte. Bei
// < 50 Familien ist ein Katalog-Read pro Request unkritisch; der
// HTTP-Cache-Header (s-maxage) unten reicht für CDN/Browser.
export async function GET() {
  try {
    const client = await createClient();
    const families = await getFamilies(client);

    return NextResponse.json(
      { ok: true, families },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Katalog konnte nicht geladen werden." },
      { status: 500 },
    );
  }
}
