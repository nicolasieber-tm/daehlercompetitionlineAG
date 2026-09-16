// lib/admin/auth.ts gegen einen gemockten better-auth-Client (kein echter
// Netzwerk-/DB-Zugriff nötig, siehe Aufgabenstellung: "Server Actions/Routen
// ohne Session -> 401/Redirect (requireAdmin mit gemocktem Client)").
// getAdminUser()/requireAdmin() nehmen dafür bewusst einen optionalen
// Client entgegen (siehe dortiger Kommentar AdminAuthClient), der nur die
// eine tatsächlich genutzte Methode (auth.api.getSession()) nachbildet.
import { describe, expect, it } from "vitest";
import { getAdminUser, requireAdmin } from "@/lib/admin/auth";
import type { AdminAuthClient, AdminUser } from "@/lib/admin/auth";

function mockClient(user: AdminUser | null): AdminAuthClient {
  return {
    api: {
      getSession: async () => (user ? { user } : null),
    },
  };
}

const FAKE_USER: AdminUser = { id: "11111111-1111-1111-1111-111111111111", email: "admin@trendingmedia.ch" };

describe("getAdminUser", () => {
  it("liefert null ohne Session", async () => {
    const user = await getAdminUser(mockClient(null));
    expect(user).toBeNull();
  });

  it("liefert den User mit Session", async () => {
    const user = await getAdminUser(mockClient(FAKE_USER));
    expect(user?.id).toBe(FAKE_USER.id);
  });
});

describe("requireAdmin", () => {
  it("leitet ohne Session um (next/navigation redirect(), wirft NEXT_REDIRECT)", async () => {
    await expect(requireAdmin(mockClient(null))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("hängt den ursprünglichen Pfad als redirectTo an, wenn übergeben", async () => {
    await expect(requireAdmin(mockClient(null), "/admin/login?next=%2Fadmin%2Feinstellungen")).rejects.toMatchObject({
      digest: expect.stringContaining("/admin/login"),
    });
  });

  it("liefert den User mit Session, ohne umzuleiten", async () => {
    const user = await requireAdmin(mockClient(FAKE_USER));
    expect(user.id).toBe(FAKE_USER.id);
  });
});
