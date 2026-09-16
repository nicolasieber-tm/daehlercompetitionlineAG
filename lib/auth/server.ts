// Admin-Login über better-auth (siehe docs/umbau-railway.md, Abschnitt
// "Login", Phase E2, und AUFGABE "Admin-Datenzugriff, Login und Fotos").
// E-Mail/Passwort, Sessions in Postgres (eigene
// Tabellen user/session/account/verification, Migration
// db/migrations/0002_auth.sql, per `npx @better-auth/cli generate` erzeugt).
//
// Eigener Pool statt lib/db/client.ts' `sql` (postgres.js): better-auth
// erwartet einen node-postgres-kompatiblen Pool (siehe
// node_modules/@better-auth/core/dist/types/database.d.mts, `database?:
// PostgresPool | ...`), keinen postgres.js-Client. Ein zusätzlicher,
// kleiner Pool (max 5, wie lib/db/client.ts) ist unproblematisch: better-
// auth nutzt ihn ausschliesslich für seine eigenen Tabellen.
import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`lib/auth/server.ts: ${name} ist nicht gesetzt. Siehe docs/db.md.`);
  }
  return value;
}

// globalThis-Guard wie lib/db/client.ts: verhindert einen weiteren Pool pro
// Hot-Reload im Next.js-Dev-Server.
declare global {
  var __daehlerAuthPool: Pool | undefined;
}

function createAuthPool(): Pool {
  return new Pool({ connectionString: requireEnv("DATABASE_URL") });
}

const authPool = globalThis.__daehlerAuthPool ?? createAuthPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__daehlerAuthPool = authPool;
}

/**
 * Sign-up ist von aussen (über die HTTP-Route /api/auth/sign-up/email)
 * deaktiviert, die zwei Admin-Konten entstehen ausschliesslich über
 * scripts/create-admin-users.ts (auth.api.signUpEmail(), serverseitiger
 * Aufruf ohne eingehenden Request). `disableSignUp` selbst würde auch
 * diesen internen Aufruf blockieren (die Prüfung in better-auth sitzt in
 * der Route selbst, nicht nur am HTTP-Rand, siehe
 * node_modules/better-auth/dist/api/routes/sign-up.mjs) - stattdessen ein
 * before-Hook, der nur Aufrufe mit einem echten eingehenden Request
 * blockiert (ctx.request ist nur gesetzt, wenn better-auth über
 * auth.handler(request) aufgerufen wurde, also über die Route; ein interner
 * Aufruf wie auth.api.signUpEmail({ body }) ganz ohne Request-Objekt kommt
 * hier nie mit ctx.request an).
 */
function blockPublicSignUp() {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path === "/sign-up/email" && ctx.request) {
      throw new APIError("FORBIDDEN", {
        message: "Registrierung ist deaktiviert. Admin-Konten werden intern angelegt.",
      });
    }
  });
}

export const auth = betterAuth({
  database: authPool,
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : undefined,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  session: {
    // 7 Tage (siehe AUFGABE).
    expiresIn: 60 * 60 * 24 * 7,
  },
  rateLimit: {
    enabled: true,
  },
  hooks: {
    before: blockPublicSignUp(),
  },
});

export type Session = typeof auth.$Infer.Session;

/** Schliesst den better-auth-Pool. Für Skripte (scripts/create-admin-users.ts),
 * die nach getaner Arbeit beenden sollen, statt auf den Idle-Timeout von
 * pg.Pool zu warten (siehe lib/db/client.ts closeDb() für dasselbe Muster). */
export async function closeAuthPool(): Promise<void> {
  await authPool.end();
}
