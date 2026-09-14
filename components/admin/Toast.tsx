"use client";

// Einfaches, sitzungsweites Toast-System: <ToastProvider> einmal in der
// Admin-Shell (components/admin/Shell.tsx), useToast() in jeder Client-
// Komponente, die eine Server Action auslöst (Status, Entwurf, Senden,
// Einstellungen). Kein Portal-Paket nötig (nicht in der freigegebenen
// Paketliste): ein `fixed`-Container reicht, da die Shell die einzige
// Stelle ist, die den Provider einbindet.
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              "pointer-events-auto w-full max-w-sm rounded-[2px] border px-4 py-3 text-sm shadow-lg",
              "bg-panel-alt text-text",
              t.kind === "error" ? "border-red-bright" : "border-ok",
            ].join(" ")}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Wirft, wenn ausserhalb von <ToastProvider> verwendet (Programmierfehler, nicht Laufzeitfall). */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() muss innerhalb von <ToastProvider> verwendet werden.");
  }
  return ctx;
}
