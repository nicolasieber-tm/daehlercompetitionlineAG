// Kundenflow-Startseite: lädt den Katalog (Server Component) und übergibt
// ihn an <Flow>. Siehe docs/architektur.md, Abschnitt "Kundenflow", und
// CLAUDE.md.
import { getFamilies } from "@/lib/catalog/queries";
import { Flow } from "@/components/flow/Flow";
import { getSettings } from "@/lib/mail/settings";
import { resolveMailTexts } from "@/lib/mail/texts";

export default async function Home() {
  const [families, settings] = await Promise.all([getFamilies(), getSettings()]);
  // Paket-Hinweis im Abschluss-Screen, im Admin unter Mailtexte gepflegt
  // (Rückmeldung dÄHLer 26.11.2026).
  const packageOfferTexts = {
    de: resolveMailTexts("de", settings).text_package_offer,
    en: resolveMailTexts("en", settings).text_package_offer,
  };
  return <Flow families={families} packageOfferTexts={packageOfferTexts} />;
}
