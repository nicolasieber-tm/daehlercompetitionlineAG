// Platzhalter für die Admin-Übersicht (Anfragen, Status, Suche, Filter).
// Wird gemäss docs/architektur.md, Abschnitt "Admin", separat aufgebaut.
export default function AdminHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
        Admin
      </span>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-text">
        dÄHLer Anfrage-Erlebnis
      </h1>
      <p className="max-w-md text-sm text-muted">
        Der Adminbereich ist im Aufbau.
      </p>
    </main>
  );
}
