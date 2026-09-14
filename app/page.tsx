// Kundenflow-Startseite: lädt den Katalog (Server Component) und übergibt
// ihn an <Flow>. Siehe docs/architektur.md, Abschnitt "Kundenflow", und
// CLAUDE.md.
import { getFamilies } from "@/lib/catalog/queries";
import { Flow } from "@/components/flow/Flow";

export default async function Home() {
  const families = await getFamilies();
  return <Flow families={families} />;
}
