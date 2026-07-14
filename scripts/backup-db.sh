#!/usr/bin/env bash
# Full logical backup of a Postgres database (schema + data) via pg_dump,
# run inside a throwaway Docker container so no local Postgres client tools
# are required. Intended use: take a backup IMMEDIATELY BEFORE running
# `prisma migrate deploy` against production, since the Supabase free tier
# does not provide automated backups (see docs/superpowers/specs — data
# retention design notes).
#
# Usage:
#   DATABASE_URL="postgresql://...supabase..." ./scripts/backup-db.sh [label]
#
# `label` is an optional free-text tag appended to the filename (e.g. "pre-pipeline-migration").
#
# Output: backups/<label-or-db>-<UTC timestamp>.sql.gz (gitignored, never committed).
# The DATABASE_URL value itself is never printed or logged.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set (the connection string to back up)." >&2
  exit 1
fi

label="${1:-backup}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_dir="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$out_dir"
out_file="$out_dir/${label}-${timestamp}.sql.gz"

echo "Backing up database to: $out_file"

# Strip any query string (Prisma-only params like ?schema=public or
# ?pgbouncer=true break pg_dump's URI parser) — pg_dump dumps the whole
# database regardless, and this project always uses the "public" schema.
dump_url="${DATABASE_URL%%\?*}"

docker run --rm postgres:16 pg_dump --no-owner --no-privileges --format=plain "$dump_url" \
  | gzip > "$out_file"

size="$(du -h "$out_file" | cut -f1)"
echo "Backup complete: $out_file ($size)"
echo "To restore: gunzip -c \"$out_file\" | docker run --rm -i postgres:16 psql \"\$TARGET_DATABASE_URL\""
