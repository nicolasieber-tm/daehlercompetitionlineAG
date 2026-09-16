"use client";

// Browser-Client für better-auth (Login/Logout, siehe
// components/admin/LoginForm.tsx, app/admin/actions/auth.ts). baseURL
// bewusst weggelassen: ohne baseURL nimmt createAuthClient() den aktuellen
// Origin (window.location.origin) - passt für jede Umgebung (lokal,
// Railway) ohne zusätzliche NEXT_PUBLIC_-Variable, die mit BETTER_AUTH_URL
// (serverseitig, siehe lib/auth/server.ts) synchron gehalten werden müsste.
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
