// Platzhalter für die read-only Ansicht einer geteilten Anfrage
// ("Paket als Link teilen", siehe docs/architektur.md).
export default async function SharedInquiryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
        dÄHLer Competition Line AG
      </span>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-text">
        Ihr Paket
      </h1>
      <p className="max-w-md text-sm text-muted">
        Diese Ansicht ist im Aufbau.
      </p>
    </main>
  );
}
