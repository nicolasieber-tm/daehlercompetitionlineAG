// clientIp() aus lib/http/client-ip.ts (von app/api/inquiries/route.ts
// verwendet): reine Funktion (kein DB-/Netzwerkzugriff), Prüfung Phase B
// Punkt 5. Railway hängt die tatsächliche Client-IP als LETZTEN Eintrag an
// x-forwarded-for an (Reverse Proxy), ein vom Client selbst mitgeschickter
// erster Eintrag ist beliebig fälschbar und darf für das Rate-Limit nicht
// massgeblich sein.
import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/http/client-ip";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/inquiries", { headers });
}

describe("clientIp", () => {
  it("nimmt den letzten Eintrag von x-forwarded-for, nicht den ersten", () => {
    const req = requestWith({ "x-forwarded-for": "203.0.113.1, 10.0.0.5, 100.64.0.9" });
    expect(clientIp(req)).toBe("100.64.0.9");
  });

  it("ein einzelner x-forwarded-for-Eintrag wird unverändert übernommen", () => {
    const req = requestWith({ "x-forwarded-for": "203.0.113.1" });
    expect(clientIp(req)).toBe("203.0.113.1");
  });

  it("trimmt Leerzeichen um die Einträge", () => {
    const req = requestWith({ "x-forwarded-for": "203.0.113.1 ,  10.0.0.5 " });
    expect(clientIp(req)).toBe("10.0.0.5");
  });

  it("fällt ohne x-forwarded-for auf x-real-ip zurück", () => {
    const req = requestWith({ "x-real-ip": "203.0.113.9" });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("liefert \"unknown\" ohne jeden IP-Header", () => {
    const req = requestWith({});
    expect(clientIp(req)).toBe("unknown");
  });

  it("ignoriert einen leeren x-forwarded-for-Header und fällt auf x-real-ip zurück", () => {
    const req = requestWith({ "x-forwarded-for": "", "x-real-ip": "203.0.113.9" });
    expect(clientIp(req)).toBe("203.0.113.9");
  });
});
