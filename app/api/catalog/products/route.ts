// GET /api/catalog/products?model=<uuid>: aktive Produkte, die ein Modell
// fitten (oder fits_all), gruppiert für den Kategorie-Schritt des
// Kundenflows, plus Hinweise. Siehe docs/architektur.md, Abschnitt
// "Kundenflow", und lib/catalog/queries.ts (getProductsForModel).
import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProductsForModel } from "@/lib/catalog/queries";

const querySchema = z.object({
  model: z.string().uuid({ message: "'model' muss eine gültige UUID sein." }),
});

export async function GET(request: NextRequest) {
  const parsedQuery = querySchema.safeParse({ model: request.nextUrl.searchParams.get("model") });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { ok: false, error: parsedQuery.error.issues[0]?.message ?? "Ungültiger Parameter 'model'." },
      { status: 400 },
    );
  }
  const { model } = parsedQuery.data;

  try {
    const client = await createClient();
    const loadProducts = unstable_cache(
      async () => getProductsForModel(model, client),
      ["catalog", "products", model],
      { tags: ["catalog"], revalidate: 3600 },
    );
    const result = await loadProducts();

    if (!result) {
      return NextResponse.json({ ok: false, error: "Modell nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true, groups: result.groups, notes: result.notes, model: result.model, family: result.family },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Produkte konnten nicht geladen werden." },
      { status: 500 },
    );
  }
}
