// Startfotos für bereits bekannte Modellfamilien. Wird von db/seed.sql (per
// UPDATE, wirkungslos solange die Familie noch nicht importiert ist) und
// später von scripts/import-pricelists.ts oder einem eigenen Re-Seed-Skript
// verwendet, damit die Zuordnung nur an einer Stelle gepflegt werden muss.
//
// slug = model_families.slug (aus dem Excel-Baureihennamen abgeleitet),
// photoUrl = public/img/models/<datei> (Bilder liegen bereits im Repo).

export type SeedPhoto = {
  slug: string;
  photoUrl: string;
};

export const SEED_PHOTOS: SeedPhoto[] = [
  { slug: "m2-g87", photoUrl: "/img/models/m2g87.jpg" },
  { slug: "m3-m4-g80-g81-g82-g83", photoUrl: "/img/models/m3g81.jpg" },
  { slug: "m5-g90-m5-g99-touring", photoUrl: "/img/models/m5g99.jpg" },
  { slug: "x3-g45", photoUrl: "/img/models/x3g45.jpg" },
];
