// lib/admin/inquiries.ts gegen die lokale DB: Filter/Suche, Test-Anfragen
// direkt per SQL anlegen und am Ende wieder löschen (siehe
// tests/helpers/db.ts, wie tests/followups/*, tests/inquiry/create.test.ts).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteInquiriesByNumberPrefix, sql } from "../helpers/db";
import { zurichDateString } from "@/lib/followups/schedule";
import {
  getFamilyFilterOptions,
  getInquiryDetail,
  getNewInquiriesCount,
  listInquiries,
} from "@/lib/admin/inquiries";

const RUN_ID = Date.now();
const NUMBER_PREFIX = `TEST-ADM-${RUN_ID}`;

let wiesmannFamilyId: string;
let olderBmwFamilyId: string;
const inquiryIds: string[] = [];

interface SeedRow {
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
  const [{ id }] = await sql<{ id: string }[]>`
    insert into inquiries (
      number, share_token, status, family_id, first_name, last_name, city, email, phone, channel,
      character, timing, created_at
    ) values (
      ${row.number}, ${randomUUID()}, ${row.status}, ${row.familyId}, ${row.firstName}, ${row.lastName},
      ${row.city}, ${row.email}, '079 000 00 00', 'email', 'sportlich', 'flexible', ${row.createdAt}
    )
    returning id
  `;
  return id;
}

beforeAll(async () => {
  const [wiesmann] = await sql<{ id: string }[]>`select id from model_families where slug = 'wiesmann'`;
  if (!wiesmann) throw new Error('Platzhalter-Baureihe "wiesmann" fehlt (db/seed.sql, npm run db:seed).');
  wiesmannFamilyId = wiesmann.id;

  const [olderBmw] = await sql<{ id: string }[]>`select id from model_families where slug = 'bmw-aelteres-modell'`;
  if (!olderBmw) throw new Error('Platzhalter-Baureihe "bmw-aelteres-modell" fehlt (db/seed.sql, npm run db:seed).');
  olderBmwFamilyId = olderBmw.id;

  const now = new Date().toISOString();

  const idA = await insertInquiry({
    number: `${NUMBER_PREFIX}-A`,
    familyId: wiesmannFamilyId,
    status: "neu",
    firstName: "Zora",
    lastName: "Zulu",
    city: "Bern",
    email: `zora.${RUN_ID}@example.com`,
    createdAt: "2020-01-15T10:00:00.000Z",
  });
  const idB = await insertInquiry({
    number: `${NUMBER_PREFIX}-B`,
    familyId: olderBmwFamilyId,
    status: "beantwortet",
    firstName: "Findus",
    lastName: "Muster",
    city: "Belp",
    email: `findus.${RUN_ID}@example.com`,
    createdAt: now,
  });
  const idC = await insertInquiry({
    number: `${NUMBER_PREFIX}-C`,
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
    number: `${NUMBER_PREFIX}-D`,
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
  await deleteInquiriesByNumberPrefix(NUMBER_PREFIX);
});

describe("listInquiries", () => {
  it("liefert alle drei Test-Anfragen ohne Filter, neueste zuerst", async () => {
    const result = await listInquiries({});
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`${NUMBER_PREFIX}-A`);
    expect(numbers).toContain(`${NUMBER_PREFIX}-B`);
    expect(numbers).toContain(`${NUMBER_PREFIX}-C`);
    // B und C sind neuer als A (2020) - A muss also nach beiden kommen.
    const indexA = numbers.indexOf(`${NUMBER_PREFIX}-A`);
    const indexB = numbers.indexOf(`${NUMBER_PREFIX}-B`);
    expect(indexB).toBeLessThan(indexA);
  });

  it("filtert nach Status", async () => {
    const result = await listInquiries({ status: "neu" });
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`${NUMBER_PREFIX}-A`);
    expect(numbers).toContain(`${NUMBER_PREFIX}-C`);
    expect(numbers).not.toContain(`${NUMBER_PREFIX}-B`);
  });

  it("filtert nach Baureihe", async () => {
    const result = await listInquiries({ familyId: wiesmannFamilyId });
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`${NUMBER_PREFIX}-A`);
    expect(numbers).toContain(`${NUMBER_PREFIX}-C`);
    expect(numbers).not.toContain(`${NUMBER_PREFIX}-B`);
    // vehicleLabel greift für Wiesmann (has_pricelist=false, aber kein Platzhaltername, siehe lib/catalog/vehicle-label.ts)
    const rowA = result.rows.find((r) => r.number === `${NUMBER_PREFIX}-A`);
    expect(rowA?.vehicleLabel).toContain("Wiesmann");
  });

  it("filtert nach Zeitraum (created_at)", async () => {
    // Zürcher Kalendertag, nicht UTC (siehe zurichDateString(), lib/followups/schedule.ts) -
    // toISOString().slice(0,10) wäre im Randfenster um Mitternacht Zürich falsch.
    const today = zurichDateString(new Date());
    const result = await listInquiries({ dateFrom: today, dateTo: today });
    const numbers = result.rows.map((r) => r.number);
    expect(numbers).toContain(`${NUMBER_PREFIX}-B`);
    expect(numbers).toContain(`${NUMBER_PREFIX}-C`);
    expect(numbers).not.toContain(`${NUMBER_PREFIX}-A`);
  });

  it("bildet Von/Bis in Europe/Zurich, nicht UTC (Prüfbefund Punkt 2)", async () => {
    // D: created_at 2025-06-01T22:30Z = 00:30 Zürich am 2.6. (Sommerzeit).
    const withZurichDay = await listInquiries({ dateFrom: "2025-06-02", dateTo: "2025-06-02" });
    expect(withZurichDay.rows.map((r) => r.number)).toContain(`${NUMBER_PREFIX}-D`);

    const withUtcDay = await listInquiries({ dateFrom: "2025-06-01", dateTo: "2025-06-01" });
    expect(withUtcDay.rows.map((r) => r.number)).not.toContain(`${NUMBER_PREFIX}-D`);
  });

  it("sucht per ilike in Vorname/Ort", async () => {
    const byName = await listInquiries({ search: "findus" });
    expect(byName.rows.map((r) => r.number)).toEqual([`${NUMBER_PREFIX}-B`]);

    const byCity = await listInquiries({ search: "belp" });
    expect(byCity.rows.map((r) => r.number)).toContain(`${NUMBER_PREFIX}-B`);

    const byNumber = await listInquiries({ search: `${NUMBER_PREFIX}-C` });
    expect(byNumber.rows.map((r) => r.number)).toEqual([`${NUMBER_PREFIX}-C`]);
  });

  it("kombiniert Status- und Baureihen-Filter", async () => {
    const result = await listInquiries({ status: "neu", familyId: olderBmwFamilyId });
    expect(result.rows.map((r) => r.number)).not.toContain(`${NUMBER_PREFIX}-B`);
    expect(result.rows).toHaveLength(result.rows.filter((r) => r.number !== `${NUMBER_PREFIX}-B`).length);
  });

  it("paginiert mit page/pageSize/pageCount/total", async () => {
    const result = await listInquiries({ page: 1 });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.rows.length).toBeLessThanOrEqual(50);
  });

  it("fällt bei einer Seitenzahl jenseits der vorhandenen Zeilen auf Seite 1 zurück, statt eine leere Seite zu liefern (Prüfbefund admin-page, Punkt 2)", async () => {
    // Auf den Suchfilter eingeschränkt, damit die Gesamtzahl garantiert klein
    // genug ist (4 Testzeilen), dass page=99 wirklich ausserhalb liegt -
    // unabhängig davon, wie viele anderen Anfragen sonst in der lokalen DB
    // stehen.
    const result = await listInquiries({ search: NUMBER_PREFIX, page: 99 });
    expect(result.page).toBe(1);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.map((r) => r.number)).toEqual(
      expect.arrayContaining([
        `${NUMBER_PREFIX}-A`,
        `${NUMBER_PREFIX}-B`,
        `${NUMBER_PREFIX}-C`,
        `${NUMBER_PREFIX}-D`,
      ]),
    );
  });
});

describe("getNewInquiriesCount", () => {
  it("zählt mindestens die zwei neuen Test-Anfragen", async () => {
    const count = await getNewInquiriesCount();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("getFamilyFilterOptions", () => {
  it("enthält Wiesmann", async () => {
    const options = await getFamilyFilterOptions();
    const wiesmann = options.find((o) => o.id === wiesmannFamilyId);
    expect(wiesmann).toBeDefined();
    expect(wiesmann?.label).toContain("Wiesmann");
  });
});

describe("getInquiryDetail", () => {
  it("lädt Kontext, Mail-Protokoll (leer) und Follow-ups (leer) für eine frische Anfrage", async () => {
    const detail = await getInquiryDetail(inquiryIds[2]);
    expect(detail).not.toBeNull();
    expect(detail?.ctx.inquiry.number).toBe(`${NUMBER_PREFIX}-C`);
    expect(detail?.outboundEmails).toEqual([]);
    expect(detail?.followUps).toEqual([]);
  });

  it("liefert null für eine unbekannte id", async () => {
    const detail = await getInquiryDetail("00000000-0000-0000-0000-000000000000");
    expect(detail).toBeNull();
  });
});
