// better-auth-Handler: bedient /api/auth/sign-in/email, /api/auth/sign-up/
// email (von aussen blockiert, siehe lib/auth/server.ts), /api/auth/
// get-session, /api/auth/sign-out usw. Siehe docs/umbau-railway.md,
// Abschnitt "Login".
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

export const { GET, POST } = toNextJsHandler(auth);
