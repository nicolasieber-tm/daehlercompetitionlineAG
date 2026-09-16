#!/usr/bin/env bash
# Tägliches Backup für den Railway-Postgres (siehe docs/umbau-railway.md,
# Zeile "Hosting", und docs/deploy-railway.md, Abschnitt "Backup-Service").
# pg_dump gegen DATABASE_URL, gzip, Ablage unter $BACKUP_DIR (auf Railway ein
# angehängtes Volume, z.B. /backups), Rotation: Dateien älter als
# RETENTION_DAYS (Standard 14) werden gelöscht. Bricht bei jedem Fehler
# sofort ab (set -euo pipefail) und gibt einen Exit-Code ungleich 0 zurück,
# damit ein fehlgeschlagener Lauf im Railway-Log sichtbar ist.
set -euo pipefail
tmp_target=""
# Abbruch (set -e) räumt eine angefangene .tmp-Datei auf.
trap '[ -n "$tmp_target" ] && rm -f "$tmp_target"' EXIT

: "${DATABASE_URL:?DATABASE_URL ist nicht gesetzt.}"
: "${BACKUP_DIR:?BACKUP_DIR ist nicht gesetzt (auf Railway: Pfad des angehängten Volumes, z.B. /backups).}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/daehler-$timestamp.sql.gz"
tmp_target="$target.tmp"

echo "backup.sh: sichere DATABASE_URL nach $target ..."

# Erst in eine .tmp-Datei schreiben und danach umbenennen: ein Abbruch
# mitten im Dump (pg_dump- oder gzip-Fehler, set -o pipefail lässt die
# ganze Pipe fehlschlagen) darf keine unvollständige, aber gültig
# aussehende .sql.gz-Datei hinterlassen.
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > "$tmp_target"
mv "$tmp_target" "$target"
tmp_target=""

echo "backup.sh: fertig ($(du -h "$target" | cut -f1))."

echo "backup.sh: entferne Backups älter als $RETENTION_DAYS Tage ..."
find "$BACKUP_DIR" -maxdepth 1 -name 'daehler-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

echo "backup.sh: erledigt."
