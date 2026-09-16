"use server";

// Abmelden (Sidebar-Button, components/admin/Shell.tsx). Server Action statt
// Client-Aufruf (Aufgabenstellung erlaubt beides für Login, Abmelden bleibt
// hier als <form action={...}> ohne JS-Abhängigkeit): auth.api.signOut()
// löscht die Session serverseitig (DB-Zeile in "session") und liefert per
// asResponse:true die Set-Cookie-Header, die das Cookie im Browser löschen -
// die übernehmen wir 1:1 in den Next.js-Cookie-Store (Cookies dürfen nur in
// Server Actions/Route Handlern geschrieben werden, nicht in Server
// Components, siehe next/headers cookies()).
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function signOutAction(): Promise<void> {
  const response = await auth.api.signOut({
    headers: await nextHeaders(),
    asResponse: true,
  });

  const cookieStore = await nextCookies();
  for (const setCookie of response.headers.getSetCookie()) {
    const [nameValue, ...attrParts] = setCookie.split(";").map((part) => part.trim());
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = nameValue.slice(0, separatorIndex);
    const value = nameValue.slice(separatorIndex + 1);
    const maxAgeAttr = attrParts.find((part) => part.toLowerCase().startsWith("max-age="));
    const maxAge = maxAgeAttr ? Number(maxAgeAttr.split("=")[1]) : undefined;
    cookieStore.set(name, value, {
      path: "/",
      maxAge: Number.isFinite(maxAge) ? maxAge : undefined,
    });
  }

  redirect("/admin/login");
}
