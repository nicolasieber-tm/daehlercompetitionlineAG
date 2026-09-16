-- Admin-Login (better-auth), siehe docs/umbau-railway.md, Abschnitt "Login",
-- Phase E2. Tabellen 1:1 aus `npx @better-auth/cli generate --config
-- lib/auth/server.ts` übernommen (better-auth erkennt an `database: new
-- Pool(...)` den Kysely/Postgres-Adapter und liefert dafür reines SQL statt
-- eines ORM-Schemas). Nicht von Hand ändern, ausser eine künftige
-- better-auth-Version verlangt ein Schema-Update - dann erneut generieren
-- und als 0003_auth_*.sql anhängen (bestehende Migrationen bleiben
-- unverändert, siehe scripts/migrate.ts: jede Datei läuft nur einmal).
--
-- user/session/account/verification sind die von better-auth selbst
-- verwalteten Tabellen (E-Mail/Passwort-Provider: "account" trägt bei
-- providerId='credential' das gehashte Passwort in der Spalte password).
-- pricelist_imports.created_by (Migration 0001) referenziert user.id ab
-- jetzt auf Anwendungsebene, bewusst ohne Fremdschlüssel-Constraint (siehe
-- dortiger Kommentar: unabhängig von dieser Migration).

create table "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create table "session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null
);

create table "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

comment on table "user" is
  'better-auth: Admin-Konten (dÄHLer, Trending Media). Registrierung von aussen deaktiviert, siehe lib/auth/server.ts (hooks.before blockPublicSignUp) und scripts/create-admin-users.ts.';
comment on table "session" is
  'better-auth: Admin-Sessions, 7 Tage gültig (siehe lib/auth/server.ts, session.expiresIn).';
comment on table "account" is
  'better-auth: Anmeldeverfahren je User. Beim E-Mail/Passwort-Provider (providerId=''credential'') liegt das gehashte Passwort in "password".';
comment on table "verification" is
  'better-auth: interne Verifikationstoken (aktuell ungenutzt, da requireEmailVerification nicht aktiviert ist).';
