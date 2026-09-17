"use client";

// Schnellweg (Posten 3): Freitext auswerten (POST /api/admin/quick/extract),
// Ergebnis prüfen/korrigieren, «Anfrage anlegen» (POST /api/admin/quick/
// create). Siehe docs/architektur.md, Abschnitt "Posten 3, Schnellweg", und
// CLAUDE.md. Kein Versand an den Kunden (sendCustomerMail=false, siehe
// app/api/admin/quick/create/route.ts).
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin, formatMissingFields, missingFieldLabel } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import type { CatalogFamily } from "@/lib/catalog/queries";
import { vehicleLineOptions } from "@/lib/catalog/vehicle-label";
import { FLOW_CATEGORIES, type Channel, type Character, type FlowCategory, type Timing } from "@/lib/db/rows";
import { Button } from "@/components/ui";
import { FormField } from "./FormField";
import { Textarea } from "./Textarea";
import { useToast } from "./Toast";
import { Card } from "./Card";

const t = admin.quick;
const tf2 = admin.quick.form;

// ---------------------------------------------------------------------------
// Typen, spiegeln die JSON-Antworten der beiden Routen (kein Import, damit
// diese Client-Komponente nicht lib/ai/extract.ts bzw. lib/ai/client.ts
// mitzieht - beide sind serverseitig, das Anthropic-SDK darf nicht in den
// Browser-Bundle gelangen).
// ---------------------------------------------------------------------------

interface ExtractionResponse {
  vehicle: { family_slug: string | null; model_slug: string | null; free_text: string; line: string | null; confidence: number };
  year: string | null;
  categories: FlowCategory[];
  selections: { product_id: string | null; name_as_written: string; confidence: number }[];
  consulting: boolean;
  character: Character | null;
  timing: Timing | null;
  contact: {
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    channel: Channel | null;
  };
  message: string;
  open_questions: string[];
  language: "de" | "en";
  uncertain: string[];
}

interface ProductOption {
  id: string;
  name: string;
  category: FlowCategory;
}

interface CatalogProductsResponse {
  ok: boolean;
  error?: string;
  groups?: { category: FlowCategory; products: { id: string; name: string }[] }[];
}

function uniqueProducts(groups: CatalogProductsResponse["groups"]): ProductOption[] {
  const out: ProductOption[] = [];
  const seen = new Set<string>();
  for (const g of groups ?? []) {
    for (const p of g.products) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, category: g.category });
    }
  }
  return out;
}

export function QuickInquiryForm({ families }: { families: CatalogFamily[] }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [rawText, setRawText] = useState("");
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [analyzing, startAnalyzing] = useTransition();
  const [creating, startCreating] = useTransition();

  const [familySlug, setFamilySlug] = useState<string | null>(null);
  const [modelSlug, setModelSlug] = useState<string | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [vehicleText, setVehicleText] = useState("");
  const [year, setYear] = useState("");
  const [categories, setCategories] = useState<FlowCategory[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [consulting, setConsulting] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [message, setMessage] = useState("");

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  const family = useMemo(() => families.find((f) => f.slug === familySlug) ?? null, [families, familySlug]);
  const model = useMemo(() => family?.models.find((m) => m.slug === modelSlug) ?? null, [family, modelSlug]);

  // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
  // Motorisierungen, das Modell ist X1 oder X2"): Dropdown nur bei
  // mehrdeutiger Baureihe (lib/ai/to-payload.ts hat bereits versucht, den
  // erkannten Modellnamen automatisch zuzuordnen, siehe applyExtraction()).
  const lineOptions = useMemo(
    () => (family && model ? vehicleLineOptions(family, model) : []),
    [family, model],
  );
  useEffect(() => {
    if (!lineOptions.some((o) => o.id === lineId)) setLineId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineOptions]);

  // Produkte des gewählten Modells nachladen (GET /api/catalog/products?model=<uuid>),
  // gleiche Route wie der Kundenflow-Kategorie-Schritt (lib/catalog/queries.ts getProductsForModel()).
  useEffect(() => {
    if (!model) {
      setProductOptions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/catalog/products?model=${model.id}`)
      .then((res) => res.json())
      .then((data: CatalogProductsResponse) => {
        if (cancelled) return;
        setProductOptions(data.ok ? uniqueProducts(data.groups) : []);
      })
      .catch(() => {
        if (!cancelled) setProductOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  function applyExtraction(data: ExtractionResponse) {
    setExtraction(data);
    setFamilySlug(data.vehicle.family_slug);
    setModelSlug(data.vehicle.model_slug);
    // Kundenentscheid 17.09.2026: bereits hier per Label-Vergleich
    // versuchen zuzuordnen (state family/model wäre erst nach dem nächsten
    // Render aktuell) - lineOptions oben validiert danach jede weitere
    // Änderung an familySlug/modelSlug erneut.
    const extractedFamily = families.find((f) => f.slug === data.vehicle.family_slug) ?? null;
    const extractedModel = extractedFamily?.models.find((m) => m.slug === data.vehicle.model_slug) ?? null;
    if (extractedFamily && extractedModel && data.vehicle.line) {
      const norm = (v: string) => v.trim().toLowerCase();
      const match = vehicleLineOptions(extractedFamily, extractedModel).find(
        (o) => norm(o.label) === norm(data.vehicle.line as string),
      );
      setLineId(match?.id ?? null);
    } else {
      setLineId(null);
    }
    setVehicleText(data.vehicle.free_text ?? "");
    setYear(data.year ?? "");
    setCategories(data.categories);
    setSelectedProductIds(data.selections.filter((s) => s.product_id).map((s) => s.product_id as string));
    setConsulting(data.consulting);
    setCharacter(data.character);
    setTiming(data.timing);
    setFirstName(data.contact.first_name ?? "");
    setLastName(data.contact.last_name ?? "");
    setCity(data.contact.city ?? "");
    setPhone(data.contact.phone ?? "");
    setEmail(data.contact.email ?? "");
    setChannel(data.contact.channel);
    setMessage(data.message ?? "");
    setMissing([]);
  }

  function handleAnalyze() {
    if (!rawText.trim()) return;
    startAnalyzing(async () => {
      try {
        const res = await fetch("/api/admin/quick/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: rawText }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; extraction?: ExtractionResponse };
        if (!data.ok || !data.extraction) {
          showToast(tf(t.input.analyzeError, { error: data.error ?? "Unbekannter Fehler." }), "error");
          return;
        }
        applyExtraction(data.extraction);
      } catch (err) {
        showToast(tf(t.input.analyzeError, { error: err instanceof Error ? err.message : "Netzwerkfehler." }), "error");
      }
    });
  }

  function toggleCategory(cat: FlowCategory) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleCreate() {
    if (!extraction) return;
    startCreating(async () => {
      try {
        const res = await fetch("/api/admin/quick/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: rawText,
            extraction,
            overrides: {
              locale: extraction.language,
              familySlug: familySlug || null,
              modelSlug: modelSlug || null,
              line: lineId,
              vehicleText: vehicleText.trim() || null,
              year: year.trim() || null,
              categories,
              consulting,
              selections: selectedProductIds.map((productId) => ({ productId })),
              character,
              timing,
              firstName: firstName.trim() || null,
              lastName: lastName.trim() || null,
              city: city.trim() || null,
              phone: phone.trim() || null,
              email: email.trim() || null,
              channel,
              message: message.trim() || null,
            },
          }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; missing?: string[]; id?: string };
        if (!data.ok) {
          setMissing(data.missing ?? []);
          // Prüfung Phase D, Punkt 5 (Nachzug): dieselbe deutsche
          // Feldnamen-Übersetzung wie die Liste unten (missingFieldLabel()),
          // statt des rohen, komma-getrennten Fehlertexts vom Server
          // ("familyId, year, firstName ..."), wenn `missing` gefüllt ist.
          const errorText =
            data.missing && data.missing.length > 0 ? formatMissingFields(data.missing) : (data.error ?? "Unbekannter Fehler.");
          showToast(tf(tf2.createError, { error: errorText }), "error");
          return;
        }
        showToast("Anfrage angelegt.", "success");
        router.push(`/admin/anfragen/${data.id}`);
      } catch (err) {
        showToast(tf(tf2.createError, { error: err instanceof Error ? err.message : "Netzwerkfehler." }), "error");
      }
    });
  }

  const filteredProducts = productOptions.filter((p) =>
    p.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <Card title={t.input.label}>
        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={t.input.placeholder}
          minHeightPx={160}
        />
        <div className="mt-3">
          <Button type="button" size="sm" disabled={analyzing || !rawText.trim()} onClick={handleAnalyze}>
            {analyzing ? t.input.analyzing : t.input.analyze}
          </Button>
        </div>
      </Card>

      {extraction && (
        <>
          {(extraction.uncertain.length > 0 || extraction.open_questions.length > 0) && (
            <Card title={t.openQuestions}>
              {extraction.uncertain.length > 0 && (
                <p className="mb-2 flex flex-wrap gap-1.5 text-sm">
                  {extraction.uncertain.map((u) => (
                    <span key={u} className="rounded-full border border-warn px-2 py-0.5 text-[11px] text-warn">
                      {t.uncertainBadge}: {u}
                    </span>
                  ))}
                </p>
              )}
              {extraction.open_questions.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                  {extraction.open_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title={tf2.resultTitle}>
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{tf2.vehicleTitle}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    label={tf2.family}
                    as="select"
                    inputProps={{
                      value: familySlug ?? "",
                      onChange: (e) => {
                        setFamilySlug(e.target.value || null);
                        setModelSlug(null);
                      },
                    }}
                  >
                    <option value="">{tf2.familyNone}</option>
                    {families.map((f) => (
                      <option key={f.slug} value={f.slug}>
                        {f.brand} {f.name}
                      </option>
                    ))}
                  </FormField>
                  <FormField
                    label={tf2.model}
                    as="select"
                    inputProps={{
                      value: modelSlug ?? "",
                      onChange: (e) => setModelSlug(e.target.value || null),
                      disabled: !family,
                    }}
                  >
                    <option value="">{tf2.modelNone}</option>
                    {(family?.models ?? []).map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.name}
                      </option>
                    ))}
                  </FormField>
                  {lineOptions.length > 0 && (
                    <FormField
                      label={tf2.line}
                      as="select"
                      inputProps={{
                        value: lineId ?? "",
                        onChange: (e) => setLineId(e.target.value || null),
                      }}
                    >
                      <option value="">{tf2.lineNone}</option>
                      {lineOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </FormField>
                  )}
                  <FormField
                    label={tf2.vehicleText}
                    inputProps={{ value: vehicleText, onChange: (e) => setVehicleText(e.target.value) }}
                  />
                  <FormField label={tf2.year} inputProps={{ value: year, onChange: (e) => setYear(e.target.value) }} />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{tf2.categoriesTitle}</h3>
                <div className="flex flex-wrap gap-2">
                  {FLOW_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em]",
                        categories.includes(cat) ? "border-red bg-red text-white" : "border-line-alt text-muted",
                      ].join(" ")}
                    >
                      {tf2.categories[cat]}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-text">
                  <input type="checkbox" checked={consulting} onChange={(e) => setConsulting(e.target.checked)} className="h-4 w-4" />
                  {tf2.consulting}
                </label>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{tf2.productsTitle}</h3>
                {!model ? (
                  <p className="text-sm text-dim">{tf2.productsEmpty}</p>
                ) : (
                  <>
                    <input
                      type="search"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={tf2.productsSearchPlaceholder}
                      className="mb-2 w-full max-w-xs rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text"
                    />
                    {categories.map((cat) => {
                      const catProducts = filteredProducts.filter((p) => p.category === cat);
                      if (catProducts.length === 0) return null;
                      return (
                        <div key={cat} className="mb-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-dim">{tf2.categories[cat]}</p>
                          <ul className="flex flex-col gap-1">
                            {catProducts.map((p) => (
                              <li key={p.id}>
                                <label className="flex items-center gap-2 text-sm text-text">
                                  <input
                                    type="checkbox"
                                    checked={selectedProductIds.includes(p.id)}
                                    onChange={() => toggleProduct(p.id)}
                                    className="h-4 w-4"
                                  />
                                  {p.name}
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {categories.length === 0 && <p className="text-sm text-dim">{tf2.productsNoneInCategory}</p>}
                  </>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{tf2.characterTitle}</h3>
                <div className="flex flex-wrap gap-2">
                  {(["dezent", "sportlich", "maximum"] as Character[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCharacter(c)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em]",
                        character === c ? "border-red bg-red text-white" : "border-line-alt text-muted",
                      ].join(" ")}
                    >
                      {tf2.character[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{tf2.timingTitle}</h3>
                <div className="flex flex-wrap gap-2">
                  {(["asap", "m1_2", "m3_6", "flexible"] as Timing[]).map((tm) => (
                    <button
                      key={tm}
                      type="button"
                      onClick={() => setTiming(tm)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em]",
                        timing === tm ? "border-red bg-red text-white" : "border-line-alt text-muted",
                      ].join(" ")}
                    >
                      {tf2.timing[tm]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{tf2.contactTitle}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label={tf2.firstName} inputProps={{ value: firstName, onChange: (e) => setFirstName(e.target.value) }} />
                  <FormField label={tf2.lastName} inputProps={{ value: lastName, onChange: (e) => setLastName(e.target.value) }} />
                  <FormField label={tf2.city} inputProps={{ value: city, onChange: (e) => setCity(e.target.value) }} />
                  <FormField label={tf2.phone} inputProps={{ value: phone, onChange: (e) => setPhone(e.target.value) }} />
                  <FormField label={tf2.email} inputProps={{ value: email, onChange: (e) => setEmail(e.target.value) }} />
                  <FormField
                    label={tf2.channel}
                    as="select"
                    inputProps={{ value: channel ?? "", onChange: (e) => setChannel((e.target.value || null) as Channel | null) }}
                  >
                    <option value="">{tf2.channelNone}</option>
                    {(["phone", "email", "whatsapp"] as Channel[]).map((c) => (
                      <option key={c} value={c}>
                        {tf2.channels[c]}
                      </option>
                    ))}
                  </FormField>
                </div>
                <div className="mt-3">
                  <FormField
                    label={tf2.message}
                    as="textarea"
                    inputProps={{ value: message, onChange: (e) => setMessage(e.target.value), rows: 3 }}
                  />
                </div>
              </div>

              {missing.length > 0 && (
                <div className="border border-red-bright bg-red-soft px-4 py-3">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-red-bright">{tf2.missingTitle}</h4>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text">
                    {missing.map((m) => (
                      <li key={m}>{missingFieldLabel(m)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <Button type="button" disabled={creating} onClick={handleCreate}>
                  {creating ? tf2.creating : tf2.create}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
