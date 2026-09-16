// Übergangs-Re-Export: der Inhalt dieser Datei ist nach lib/db/rows.ts
// umgezogen (siehe docs/umbau-railway.md, Abschnitt "Datenzugriffsschicht").
// Module, die noch von hier importieren, funktionieren unverändert weiter;
// neue und umgestellte Module importieren direkt aus "@/lib/db/rows".
// lib/supabase/ wird am Ende von Phase E3 entfernt (Ordner "supabase/"
// bleibt in der Git-Historie erhalten).
export * from "@/lib/db/rows";
