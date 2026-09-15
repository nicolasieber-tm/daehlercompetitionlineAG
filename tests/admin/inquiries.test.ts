// lib/admin/inquiries.ts gegen die lokale DB (siehe Aufgabenstellung:
// "lib/admin/inquiries.ts Filter/Suche gegen die lokale DB, Test-Anfragen
// anlegen und löschen"). Schreibt/liest direkt über den Service-Role-Client
// (wie tests/mail/resend.test.ts, tests/inquiry/create.test.ts), räumt die
// selbst angelegten Test-Anfragen am Ende wieder auf.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { zurichDateString } from "@/lib/followups/schedule";
import {
  getFamilyFilterOptions,
  getInquiryDetail,
  getNewInquiriesCount,
  listInquiries,
} from "@/lib/admin/inquiries";

const admin = createAdminClient();
const RUN_ID = Date.now();

let wiesmannFamilyId: string;
let olderBmwFamilyId: string;
const inquiryIds: string[] = [];

interface SeedRow {
  id?: string;
  number: string;
  familyId: string;
  status: "neu" | "in_bearbeitung" | "beantwortet" | "abgeschlossen";
  firstName: string;
  lastName: string;
  city: string;
  email: string;
  createdAt: string;
}

async function insertInquiry(row: SeedRow): Promise<string> {
  const { data, error } = await admin
    .from("inquiries")
    .insert({
      number: row.number,
      share_token: randomUUID(),
      status: row.status,
      family_id: row.familyId,
      first_name: row.firstName,
      last_name: row.lastName,
      city: row.city,
      email: row.email,
      phone: "079 000 00 00",
      channel: "email",
      categories: [],
      character: "sportlich",
      timing: "flexible",
      created_at: row.createdAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const { data: wiesmann, error: wiesmannError } = await admin
    .from("model_families")
    .select("id")
    .eq("slug", "wiesmann")
    .single();
  if (wiesmannError) throw wiesmannError;
  wiesmannFamilyId = wiesmann.id;

  const { data: olderBmw, error: olderBmwError } = await admin
    .from("model_families")
    .select("id")
    .eq("slug", "bmw-aelteres-modell")
    .single();
  if (olderBmwError) throw olderBmwError;
  olderBmwFamilyId = olderBmw.id;

  const now = new Date().toISOString();

  const idA = await insertInquiry({
    number: `TEST-ADM-${RUN_ID}-A`,
    familyId: wiesmannFamilyId,
    status: "neu",
    firstName: "Zora",
    lastName: "Zulu",
    city: "Bern",
    email: `zora.${RUN_ID}@example.com`,
    createdAt: "2020-01-15T10:00:00.000Z",
  });
  const idB = await insertInquiry({
    number: `TEST-ADM-${RUN_ID}-B`,
    familyId: olderBmwFamilyId,
    status: "beantwortet",
    firstName: "Findus",
    lastName: "Muster",
    city: "Belp",
    email: `findus.${RUN_ID}@example.com`,
    createdAt: now,
  });
  const idC = await insertInquiry({
    number: `TEST-ADM-${RUN_ID}-C`,
    familyId: wiesmannFamilyId,
    status: "neu",
    firstName: "Anna",
    lastName: "Beispiel",
    city: "Thun",
    email: `anna.${RUN_ID}@example.com`,
    createdAt: now,
  });
  // 22:30 UTC am 1.6. = 00:30 Zürich am 2.6. (Sommerzeit, +2h) - Randfall für
  // den Zeitraum-Filter (Prüfbefund admin-shell, Punkt 2): created_at liegt
  // in UTC am 1.6., die Tabelle zeigt das Datum aber über formatDate() in
  // Zürcher Ortszeit als 2.6. an.
  const idD = await insertInquiry({
    number: `TEST-ADM-${RUN_ID}-D`,
    familyId: wiesmannFamilyId,
    status: "neu",
    firstName: "Timo",
    lastName: "Randfall",
    city: "Belp",
    email: `timo.${RUN_ID}@example.com`,
    createdAt: "2025-06-01T22:30:00.000Z",
  });
  inquiryIds.push(idA, idB, idC, idD);
});

afterAll(async () => {
  if (inquiryIds.length > 0) {
    await admin.from("inquiries").delete().in("id", inquiryIds);
  }
});

describe("listInquiries", () => {
  it("liefert alle drei Test-Anfragen ohne Filter, neueste zuerst", async () => {
    const result = await listInquiries({}, admin);
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-A`);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-B`);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-C`);
    // B und C sind neuer als A (2020) - A muss also nach beiden kommen.
    const indexA = numbers.indexOf(`TEST-ADM-${RUN_ID}-A`);
    const indexB = numbers.indexOf(`TEST-ADM-${RUN_ID}-B`);
    expect(indexB).toBeLessThan(indexA);
  });

  it("filtert nach Status", async () => {
    const result = await listInquiries({ status: "neu" }, admin);
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-A`);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-C`);
    expect(numbers).not.toContain(`TEST-ADM-${RUN_ID}-B`);
  });

  it("filtert nach Baureihe", async () => {
    const result = await listInquiries({ familyId: wiesmannFamilyId }, admin);
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-A`);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-C`);
    expect(numbers).not.toContain(`TEST-ADM-${RUN_ID}-B`);
    // vehicleLabel greift für Wiesmann (has_pricelist=false, aber kein Platzhaltername, siehe lib/mail/render.ts)
    const rowA = result.rows.find((r) => r.number === `TEST-ADM-${RUN_ID}-A`);
    expect(rowA?.vehicleLabel).toContain("Wiesmann");
  });

  it("filtert nach Zeitraum (created_at)", async () => {
    // Zürcher Kalendertag, nicht UTC (siehe zurichDateString(), lib/followups/schedule.ts) -
    // toISOString().slice(0,10) wäre im Randfenster um Mitternacht Zürich falsch.
    const today = zurichDateString(new Date());
    const result = await listInquiries({ dateFrom: today, dateTo: today }, admin);
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-B`);
    expect(numbers).toContain(`TEST-ADM-${RUN_ID}-C`);
    expect(numbers).not.toContain(`TEST-ADM-${RUN_ID}-A`);
  });

  it("bildet Von/Bis in Europe/Zurich, nicht UTC (Prüfbefund Punkt 2)", async () => {
    // D: created_at 2025-06-01T22:30Z = 00:30 Zürich am 2.6. (Sommerzeit).
    const withZurichDay = await listInquiries({ dateFrom: "2025-06-02", dateTo: "2025-06-02" }, admin);
    expect(withZurichDay.rows.map((r) => r.number)).toContain(`TEST-ADM-${RUN_ID}-D`);

    const withUtcDay = await listInquiries({ dateFrom: "2025-06-01", dateTo: "2025-06-01" }, admin);
    expect(withUtcDay.rows.map((r) => r.number)).not.toContain(`TEST-ADM-${RUN_ID}-D`);
  });

  it("sucht per ilike in Vorname/Ort", async () => {
    const byName = await listInquiries({ search: "findus" }, admin);
    expect(byName.rows.map((r) => r.number)).toEqual([`TEST-ADM-${RUN_ID}-B`]);

    const byCity = await listInquiries({ search: "belp" }, admin);
    expect(byCity.rows.map((r) => r.number)).toContain(`TEST-ADM-${RUN_ID}-B`);

    const byNumber = await listInquiries({ search: `TEST-ADM-${RUN_ID}-C` }, admin);
    expect(byNumber.rows.map((r) => r.number)).toEqual([`TEST-ADM-${RUN_ID}-C`]);
  });

  it("kombiniert Status- und Baureihen-Filter", async () => {
    const result = await listInquiries({ status: "neu", familyId: olderBmwFamilyId }, admin);
    expect(result.rows.map((r) => r.number)).not.toContain(`TEST-ADM-${RUN_ID}-B`);
    expect(result.rows).toHaveLength(result.rows.filter((r) => r.number !== `TEST-ADM-${RUN_ID}-B`).length);
  });

  it("paginiert mit page/pageSize/pageCount/total", async () => {
    const result = await listInquiries({ page: 1 }, admin);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.rows.length).toBeLessThanOrEqual(50);
  });

  it("fällt bei einer Seitenzahl jenseits der vorhandenen Zeilen (PostgREST-Fehler PGRST103/HTTP 416) auf Seite 1 zurück, statt zu werfen (Prüfbefund admin-page, Punkt 2)", async () => {
    // Auf den Suchfilter eingeschränkt, damit die Gesamtzahl garantiert klein
    // genug ist (4 Testzeilen), dass .range() für page=99 wirklich ausserhalb
    // liegt - unabhängig davon, wie viele andere Anfragen sonst in der
    // lokalen DB stehen.
    const result = await listInquiries({ search: `TEST-ADM-${RUN_ID}`, page: 99 }, admin);
    expect(result.page).toBe(1);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.map((r) => r.number)).toEqual(
      expect.arrayContaining([
        `TEST-ADM-${RUN_ID}-A`,
        `TEST-ADM-${RUN_ID}-B`,
        `TEST-ADM-${RUN_ID}-C`,
        `TEST-ADM-${RUN_ID}-D`,
      ]),
    );
  });
});

describe("getNewInquiriesCount", () => {
  it("zählt mindestens die zwei neuen Test-Anfragen", async () => {
    const count = await getNewInquiriesCount(admin);
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("getFamilyFilterOptions", () => {
  it("enthält Wiesmann", async () => {
    const options = await getFamilyFilterOptions(admin);
    const wiesmann = options.find((o) => o.id === wiesmannFamilyId);
    expect(wiesmann).toBeDefined();
    expect(wiesmann?.label).toContain("Wiesmann");
  });
});

describe("getInquiryDetail", () => {
  it("lädt Kontext, Mail-Protokoll (leer) und Follow-ups (leer) für eine frische Anfrage", async () => {
    const detail = await getInquiryDetail(inquiryIds[2], admin);
    expect(detail).not.toBeNull();
    expect(detail?.ctx.inquiry.number).toBe(`TEST-ADM-${RUN_ID}-C`);
    expect(detail?.outboundEmails).toEqual([]);
    expect(detail?.followUps).toEqual([]);
  });

  it("liefert null für eine unbekannte id", async () => {
    const detail = await getInquiryDetail("00000000-0000-0000-0000-000000000000", admin);
    expect(detail).toBeNull();
  });
});
