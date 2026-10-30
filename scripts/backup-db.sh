#!/usr/bin/env bash
# Encrypted, self-describing backup of schema `public` (all application data).
#
#   DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup-db.sh [label]
#
# One psql session opens a REPEATABLE READ transaction, exports its snapshot,
# runs `pg_dump --snapshot` (custom format) and computes the manifest
# (scripts/db-backup/manifest.sql: rows + content hash per table, RLS flags,
# owners, policies, GRANTs, migrations) INSIDE that same snapshot, so dump and
# manifest describe exactly the same data even while production keeps writing.
#
# Output (backups/, gitignored; nothing in clear text ever touches it):
#   <label>-<UTC>.backup.tar.gpg          gpg AES-256 of {db.dump, manifest.txt}
#   <label>-<UTC>.backup.tar.gpg.sha256   sha256 of the encrypted file
# Check and restore it with scripts/verify-db-backup.sh.
#
# Supabase-managed schemas (auth, storage, ...) are not included: the app keeps
# all its data in `public`. Roles are recorded by NAME only (pg_dumpall
# --roles-only is unreliable on Supabase); verification creates stubs for them.
#
# Client tools: PG_BIN_DIR=/usr/lib/postgresql/<major>/bin (CI), otherwise
# Docker with PG_IMAGE (default: postgres:<server major>). The connection URL is
# passed through the environment only and never printed.
set -euo pipefail
umask 077

# shellcheck source=db-backup/common.sh
source "$(dirname "$0")/db-backup/common.sh"

require_env DATABASE_URL BACKUP_PASSPHRASE
require_cmd gpg sha256sum tar sort

label="${1:-backup}"
[[ "$label" =~ ^[A-Za-z0-9._-]+$ ]] || die "$EXIT_USAGE" "label may only contain letters, digits, '.', '_' and '-'"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_dir="${BACKUP_OUT_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
mkdir -p "$out_dir"
out_file="$out_dir/${label}-${timestamp}.backup.tar.gpg"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$DB_BACKUP_DIR/manifest.sql" "$work/manifest.sql"

PGURL="$(libpq_url "$DATABASE_URL")"
export PGURL

# Runs a PostgreSQL client tool with PGURL in its environment, either locally
# or in Docker (work dir mounted at the same path, host network).
pg_client() {
  if [ -n "${PG_BIN_DIR:-}" ]; then
    PATH="$PG_BIN_DIR:$PATH" "$@"
  else
    docker run --rm -i --network host --user "$(id -u):$(id -g)" \
      -e PGURL -v "$work:$work" -w "$work" "$pg_image" "$@"
  fi
}

if [ -z "${PG_BIN_DIR:-}" ]; then
  require_cmd docker
  pg_image="${PG_IMAGE:-}"
  if [ -z "$pg_image" ]; then
    major="$(run_redacted "$EXIT_BACKUP" "server version probe" \
      docker run --rm --network host -e PGURL postgres:17 \
      sh -c 'psql -X -A -t -d "$PGURL" -c "select current_setting('"'server_version_num'"')::int / 10000"')"
    pg_image="postgres:${major}"
  fi
  log "client tools: $pg_image (docker)"
else
  log "client tools: $PG_BIN_DIR"
fi

log "dumping schema public and computing the manifest in one snapshot"
session_sql="$(cat <<SQL
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot() AS snapshot \\gset
\\setenv PGSNAPSHOT :snapshot
\\! pg_dump --snapshot="\$PGSNAPSHOT" --format=custom --schema=public --file="$work/db.dump" -d "\$PGURL" && touch "$work/dump.ok"
\\o $work/manifest.raw
\\i $work/manifest.sql
SELECT 'role|' || rolname FROM pg_roles WHERE rolname !~ '^pg_';
SELECT 'meta|server_major|' || current_setting('server_version_num')::int / 10000;
\\o
COMMIT;
SQL
)"
run_redacted "$EXIT_BACKUP" "snapshot session" \
  pg_client sh -c 'exec psql -X -A -t -q -v ON_ERROR_STOP=1 -d "$PGURL"' <<<"$session_sql"

# psql does not fail on a failed \! command: the marker proves pg_dump succeeded.
[ -f "$work/dump.ok" ] || die "$EXIT_BACKUP" "pg_dump failed"
run_redacted "$EXIT_BACKUP" "dump table of contents check" \
  pg_client pg_restore --list "$work/db.dump" >/dev/null

LC_ALL=C sort "$work/manifest.raw" >"$work/manifest.txt"
grep -q '^meta|server_major|' "$work/manifest.txt" || die "$EXIT_BACKUP" "manifest is incomplete"
tables="$(grep -c '^rows|' "$work/manifest.txt")" || die "$EXIT_BACKUP" "manifest lists no tables"
printf 'dumpsha|%s\n' "$(sha256sum "$work/db.dump" | cut -d' ' -f1)" >>"$work/manifest.txt"

tar -C "$work" -cf "$work/bundle.tar" db.dump manifest.txt
run_redacted "$EXIT_BACKUP" "encryption" gpg_encrypt "$work/bundle.tar" "$out_file"
(cd "$out_dir" && sha256sum "$(basename "$out_file")" >"$(basename "$out_file").sha256")

rows="$(awk -F'|' '$1 == "rows" { total += $3 } END { print total + 0 }' "$work/manifest.txt")"
log "backup ready: $out_file ($(du -h "$out_file" | cut -f1)), $tables tables, $rows rows"
log "checksum: $out_file.sha256"
