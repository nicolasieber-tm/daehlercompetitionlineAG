// GET /api/catalog: öffentlicher Katalog (aktive Familien mit aktiven
// Modellen) für den Kundenflow. Siehe docs/architektur.md, Abschnitt
// "Kundenflow", und lib/catalog/queries.ts.
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getFamilies } from "@/lib/catalog/queries";

// Next-Datencache (Tag "catalog", von lib/pricelist/imports.ts nach jedem
// übernommenen Import per revalidateTag invalidiert) plus HTTP-Cache-Header
// für CDN/Browser (s-maxage), siehe Aufgabenstellung.
export async function GET() {
  try {
    const client = await createClient();
    const loadFamilies = unstable_cache(async () => getFamilies(client), ["catalog", "families"], {
      tags: ["catalog"],
      revalidate: 3600,
    });
    const families = await loadFamilies();

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
