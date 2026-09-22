#!/usr/bin/env bash
# Start-Befehl auf Railway (.railway/railway.ts → deploy.startCommand):
# 1. Migrationen und Seed (idempotent), 2. Admin-Konten (idempotent),
# 3. optional einmaliger Preislisten-Import, wenn IMPORT_ON_START=1 gesetzt
#    ist (danach die Variable wieder entfernen), 4. Next.js starten.
set -euo pipefail
echo "[start] Migrationen und Seed"
npx tsx scripts/migrate.ts --seed
echo "[start] Admin-Konten"
npx tsx scripts/create-admin-users.ts
if [ "${IMPORT_ON_START:-0}" = "1" ]; then
  echo "[start] IMPORT_ON_START=1: Preislisten importieren"
  npx tsx scripts/import-pricelists.ts --apply
fi
echo "[start] Next.js starten"
exec npm start
