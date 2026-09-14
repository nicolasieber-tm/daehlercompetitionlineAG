// Client-IP aus dem Request ermitteln, für Rate-Limits o.ä. Eigenes Modul,
// damit app/api/inquiries/route.ts ausschliesslich HTTP-Methoden-Exports
// enthält (Next.js Route Handler erlauben keine weiteren Exports, siehe
// Prüfbefund "clientIp ist kein gültiger Route-Export").
//
// Prüfung Phase B, Punkt 5: der LETZTE Eintrag in x-forwarded-for ist die
// Client-IP, nicht der erste. Railway (CLAUDE.md, Abschnitt "Architektur":
// Hosting Railway) hängt als Reverse Proxy die tatsächliche Verbindungs-IP
// am ENDE der bestehenden Kopfzeile an ("bekannte-proxies, ..., client-ip"),
// ein vorheriger, vom Client selbst mitgeschickter (und damit fälschbarer)
// Eintrag stand vorher fälschlich an erster Stelle und wurde für das
// Rate-Limit verwendet - beliebig leicht zu umgehen, indem der Client
// selbst einen erfundenen ersten x-forwarded-for-Wert mitschickt.
export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return request.headers.get("x-real-ip") || "unknown";
}
