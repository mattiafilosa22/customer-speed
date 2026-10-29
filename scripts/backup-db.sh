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

# pg_dump must be at least the server's major version (an older one refuses to
# dump). Two ways to run it:
#  - PG_BIN_DIR=/usr/lib/postgresql/<major>/bin → local client binaries (CI);
#  - otherwise Docker, with the image matching the server unless PG_IMAGE is set
#    (--network host also reaches a database published on this machine).
if [ -n "${PG_BIN_DIR:-}" ]; then
  pg_dump_cmd=("$PG_BIN_DIR/pg_dump")
  restore_cmd="$PG_BIN_DIR/psql"
else
  pg_image="${PG_IMAGE:-}"
  if [ -z "$pg_image" ]; then
    server_major="$(docker run --rm --network host postgres:17 psql "$dump_url" -tAc "select current_setting('server_version_num')::int / 10000")"
    pg_image="postgres:${server_major}"
  fi
  pg_dump_cmd=(docker run --rm --network host "$pg_image" pg_dump)
  restore_cmd="docker run --rm -i --network host $pg_image psql"
fi
echo "Using: ${pg_dump_cmd[*]}"

"${pg_dump_cmd[@]}" --no-owner --no-privileges --format=plain "$dump_url" | gzip > "$out_file"

# pg_dump writes this footer only after the whole database was dumped: a
# truncated or failed dump never passes for a good one.
if ! gunzip -c "$out_file" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
  echo "Backup is incomplete: $out_file" >&2
  exit 1
fi

size="$(du -h "$out_file" | cut -f1)"
echo "Backup complete: $out_file ($size)"
echo "To restore: gunzip -c \"$out_file\" | $restore_cmd \"\$TARGET_DATABASE_URL\""
