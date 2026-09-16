"use server";

// Abmelden (Sidebar-Button, components/admin/Shell.tsx). Server Action statt
// Client-Aufruf (Aufgabenstellung erlaubt beides für Login, Abmelden bleibt
// hier als <form action={...}> ohne JS-Abhängigkeit): auth.api.signOut()
// löscht die Session serverseitig (DB-Zeile in "session") und liefert per
// asResponse:true die Set-Cookie-Header, die das Cookie im Browser löschen -
// die übernehmen wir 1:1 in den Next.js-Cookie-Store (Cookies dürfen nur in
// Server Actions/Route Handlern geschrieben werden, nicht in Server
// Components, siehe next/headers cookies()).
//
// Befund (Bericht, Phase E3): die frühere Fassung übernahm aus dem
// Set-Cookie-Header nur Name/Wert/Max-Age und setzte Path hart auf "/" -
// HttpOnly, Secure, SameSite und Domain gingen verloren. Unter https nutzt
// better-auth für Session-Cookies das Präfix "__Secure-" (siehe RFC 6265bis),
// dessen Cookies der Browser nur akzeptiert, wenn das Secure-Attribut
// tatsächlich gesetzt ist - ohne Secure liess sich das Cookie in Produktion
// also gar nicht löschen, das Abmelden blieb wirkungslos. parseSetCookie()
// übernimmt deshalb alle Attribute des von better-auth gelieferten Headers.
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

interface ParsedSetCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

function parseSetCookie(setCookie: string): ParsedSetCookie | null {
  const [nameValue, ...attrParts] = setCookie.split(";").map((part) => part.trim());
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex === -1) return null;

  const cookie: ParsedSetCookie = {
    name: nameValue.slice(0, separatorIndex),
    value: nameValue.slice(separatorIndex + 1),
  };

  for (const attr of attrParts) {
    const eqIndex = attr.indexOf("=");
    const key = (eqIndex === -1 ? attr : attr.slice(0, eqIndex)).toLowerCase();
    const value = eqIndex === -1 ? undefined : attr.slice(eqIndex + 1);
    switch (key) {
      case "path":
        cookie.path = value;
        break;
      case "domain":
        cookie.domain = value;
        break;
      case "max-age": {
        const maxAge = Number(value);
        if (Number.isFinite(maxAge)) cookie.maxAge = maxAge;
        break;
      }
      case "expires": {
        const expires = value ? new Date(value) : undefined;
        if (expires && !Number.isNaN(expires.getTime())) cookie.expires = expires;
        break;
      }
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "samesite": {
        const sameSite = value?.toLowerCase();
        if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
          cookie.sameSite = sameSite;
        }
        break;
      }
    }
  }

  return cookie;
}

export async function signOutAction(): Promise<void> {
  const response = await auth.api.signOut({
    headers: await nextHeaders(),
    asResponse: true,
  });

  const cookieStore = await nextCookies();
  for (const setCookie of response.headers.getSetCookie()) {
    const parsed = parseSetCookie(setCookie);
    if (!parsed) continue;
    cookieStore.set(parsed.name, parsed.value, {
      path: parsed.path ?? "/",
      domain: parsed.domain,
      maxAge: parsed.maxAge,
      expires: parsed.expires,
      httpOnly: parsed.httpOnly,
      secure: parsed.secure,
      sameSite: parsed.sameSite,
    });
  }

  redirect("/admin/login");
}
