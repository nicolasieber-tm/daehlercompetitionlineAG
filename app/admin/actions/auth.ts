"use server";

// Abmelden (Sidebar-Button, components/admin/Shell.tsx). Login selbst läuft
// bewusst über den Browser-Client (components/admin/LoginForm.tsx,
// signInWithPassword, siehe Aufgabenstellung), Abmelden dagegen über eine
// Server Action: signOut() muss das Session-Cookie server-seitig löschen
// (lib/supabase/server.ts createClient(), Cookie-Schreibzugriff ist nur in
// Server Actions/Route Handlern erlaubt, nicht in Server Components).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
