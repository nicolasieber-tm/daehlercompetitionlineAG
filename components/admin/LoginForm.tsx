"use client";

// Login: E-Mail/Passwort über Supabase Auth, Browser-Client,
// signInWithPassword (Aufgabenstellung). Absichtlich der Browser-Client
// (lib/supabase/client.ts), nicht eine Server Action: signInWithPassword
// setzt die Session-Cookies clientseitig über @supabase/ssr, danach liest
// jede weitere Server-Anfrage (auch der anschliessende router.push) sie
// direkt aus dem Cookie-Header, ohne einen Zwischenschritt über eine Action.
import { useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { admin } from "@/lib/i18n/admin";
import { Button } from "@/components/ui";
import { FormField } from "./FormField";

/** Nur ein relativer, admin-interner Pfad ist ein gültiges Redirect-Ziel (offene Redirects vermeiden). */
function safeNext(value: string | null): string {
  if (value && value.startsWith("/admin") && !value.startsWith("//")) return value;
  return "/admin";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(admin.login.errorInvalid);
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <FormField
        label={admin.login.email}
        inputProps={{
          type: "email",
          name: "email",
          value: email,
          onChange: (e) => setEmail(e.target.value),
          required: true,
          autoComplete: "username",
          autoFocus: true,
        }}
      />
      <FormField
        label={admin.login.password}
        inputProps={{
          type: "password",
          name: "password",
          value: password,
          onChange: (e) => setPassword(e.target.value),
          required: true,
          autoComplete: "current-password",
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-red-bright">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-1 justify-center">
        {pending ? admin.login.submitPending : admin.login.submit}
      </Button>
    </form>
  );
}
