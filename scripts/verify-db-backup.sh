#!/usr/bin/env bash
# Proves an encrypted backup (scripts/backup-db.sh) is restorable and complete.
#
#   BACKUP_PASSPHRASE=... scripts/verify-db-backup.sh backups/<name>.backup.tar.gpg
#
# Fail-closed pipeline, one exit code per stage (scripts/db-backup/common.sh):
#   10 checksum   sha256 of the encrypted file vs <file>.sha256
#   11 decrypt    gpg (wrong key / tampered ciphertext)
#   12 bundle     dump + manifest present, dump sha256 matches the manifest
#   16 image      PG_IMAGE major differs from the source server major
#   13 restore    pg_restore --exit-on-error --single-transaction in a throwaway,
#                 network-less Postgres container, after creating NOLOGIN stubs
#                 for every source role (so owners, GRANTs and policies restore)
#   14 manifest   rows + content hash per table, RLS flags, owners, policies,
#                 GRANTs and migrations of the restored copy == source manifest
#   15 synthetic  scripts/db-backup/synthetic-test.sql on the restored copy
# Exit 0 only when every stage passed.
#
# PG_IMAGE: image for the throwaway server (default postgres:<source major>).
# PG_SUPERUSER: superuser of that image (default postgres; supabase_admin for
# the supabase/postgres image).
set -euo pipefail
umask 077

# shellcheck source=db-backup/common.sh
source "$(dirname "$0")/db-backup/common.sh"

[ "$#" -eq 1 ] || die "$EXIT_USAGE" "usage: $0 <backup.tar.gpg>"
require_env BACKUP_PASSPHRASE
require_cmd gpg sha256sum tar docker diff sort

backup="$1"
checksum="$backup.sha256"
[ -f "$backup" ] || die "$EXIT_USAGE" "backup not found: $backup"
[ -f "$checksum" ] || die "$EXIT_CHECKSUM" "checksum file not found: $checksum"

work="$(mktemp -d)"
container=""
cleanup() {
  if [ -n "$container" ]; then docker rm -f "$container" >/dev/null 2>&1 || log "could not remove container $container"; fi
  rm -rf "$work"
}
trap cleanup EXIT

# 1. Checksum: the .sha256 must name exactly this file and match it.
expected_name="$(awk '{ print $2 }' "$checksum")"
[ "${expected_name#\*}" = "$(basename "$backup")" ] || die "$EXIT_CHECKSUM" "checksum file does not refer to $(basename "$backup")"
(cd "$(dirname "$backup")" && sha256sum --check --strict --quiet "$(basename "$checksum")") \
  || die "$EXIT_CHECKSUM" "sha256 mismatch: the backup file is corrupted or was altered"
log "1/6 checksum ok"

# 2. Decrypt (gpg also authenticates the ciphertext with its MDC).
run_redacted "$EXIT_DECRYPT" "decryption (wrong passphrase or tampered file)" \
  gpg_decrypt "$backup" "$work/bundle.tar"
log "2/6 decryption ok"

# 3. Bundle integrity.
tar -C "$work" -xf "$work/bundle.tar" db.dump manifest.txt 2>/dev/null \
  || die "$EXIT_BUNDLE" "bundle does not contain db.dump and manifest.txt"
manifest="$work/manifest.txt"
dumpsha="$(awk -F'|' '$1 == "dumpsha" { print $2 }' "$manifest")"
[ -n "$dumpsha" ] || die "$EXIT_BUNDLE" "manifest has no dump checksum"
[ "$(sha256sum "$work/db.dump" | cut -d' ' -f1)" = "$dumpsha" ] || die "$EXIT_BUNDLE" "dump checksum differs from the manifest"
major="$(awk -F'|' '$1 == "meta" && $2 == "server_major" { print $3 }' "$manifest")"
[[ "$major" =~ ^[0-9]+$ ]] || die "$EXIT_BUNDLE" "manifest has no source server version"
log "3/6 bundle ok (source PostgreSQL $major)"

# 4. Throwaway server, no network at all; everything goes through docker exec.
image="${PG_IMAGE:-postgres:$major}"
superuser="${PG_SUPERUSER:-postgres}"
container="db-backup-verify-$$-$RANDOM"
server_password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
run_redacted "$EXIT_RESTORE" "starting $image" \
  docker run -d --name "$container" --network none -e POSTGRES_PASSWORD="$server_password" "$image" >/dev/null

ready=""
for _ in $(seq 1 90); do
  # TCP readiness: the image's temporary init server listens on the socket only.
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U "$superuser" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ -n "$ready" ] || die "$EXIT_RESTORE" "throwaway server did not start"

# psql_in <database> [psql args...] — runs psql inside the container, stdin passthrough.
psql_in() {
  local db="$1"
  shift
  docker exec -i -e PGPASSWORD="$server_password" "$container" psql -X -A -t -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$superuser" -d "$db" "$@"
}
server_major="$(run_redacted "$EXIT_RESTORE" "server version check" psql_in postgres -c "select current_setting('server_version_num')::int / 10000")"
[ "$server_major" = "$major" ] || die "$EXIT_IMAGE" "$image runs PostgreSQL $server_major, the backup comes from $major"

# Clean target database. Its stock `public` schema is KEPT: pg_dump (PG15+)
# omits public's default ACL (USAGE for PUBLIC), so a recreated schema would
# silently lose it. The dump's explicit schema ACL entries apply on top.
run_redacted "$EXIT_RESTORE" "creating the target database" \
  psql_in postgres -c "CREATE DATABASE restore_check TEMPLATE template0"

# Role stubs: names only, NOLOGIN, no passwords.
{
  printf 'CREATE TEMP TABLE wanted(name text);\nCOPY wanted FROM STDIN;\n'
  awk -F'|' '$1 == "role" { print $2 }' "$manifest"
  printf '\\.\n'
  printf "SELECT format('CREATE ROLE %%I NOLOGIN', name) FROM wanted WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = name) \\\\gexec\n"
} >"$work/roles.sql"
run_redacted "$EXIT_RESTORE" "creating role stubs" psql_in postgres <"$work/roles.sql"
log "4/6 throwaway $image ready, $(awk -F'|' '$1 == "role"' "$manifest" | wc -l | tr -d ' ') role names stubbed"

run_redacted "$EXIT_RESTORE" "docker cp" docker cp "$work/db.dump" "$container:/tmp/db.dump"
# Restore everything except the CREATE SCHEMA public entry (schema kept above).
run_redacted "$EXIT_RESTORE" "reading the dump table of contents" \
  docker exec "$container" pg_restore --list /tmp/db.dump >"$work/toc.list"
grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' "$work/toc.list" >"$work/restore.list" \
  || die "$EXIT_RESTORE" "the dump table of contents is empty"
run_redacted "$EXIT_RESTORE" "docker cp" docker cp "$work/restore.list" "$container:/tmp/restore.list"
run_redacted "$EXIT_RESTORE" "pg_restore" \
  docker exec -e PGPASSWORD="$server_password" "$container" pg_restore -h 127.0.0.1 -U "$superuser" -d restore_check \
  --exit-on-error --single-transaction --use-list=/tmp/restore.list /tmp/db.dump
log "5/6 restore ok"

# 6a. Manifest of the restored copy must equal the source's (same query file).
psql_in restore_check <"$DB_BACKUP_DIR/manifest.sql" >"$work/restored.raw" 2>"$work/restored.err" \
  || { redact <"$work/restored.err" >&2; die "$EXIT_MANIFEST" "could not compute the manifest of the restored copy"; }
LC_ALL=C sort "$work/restored.raw" >"$work/restored.txt"
grep -v -E '^(role|meta|dumpsha)\|' "$manifest" >"$work/expected.txt" || die "$EXIT_MANIFEST" "source manifest has no comparable facts"
if ! diff -u --label source --label restored "$work/expected.txt" "$work/restored.txt" >"$work/manifest.diff"; then
  head -n 40 "$work/manifest.diff" >&2
  die "$EXIT_MANIFEST" "restored copy differs from the source manifest"
fi
log "6/6 manifest identical: $(grep -c '^rows|' "$work/expected.txt") tables (rows + content), $(grep -c '^policy|' "$work/expected.txt") policies, $(grep -c '^grant|' "$work/expected.txt") grants"

# 6b. Synthetic test.
run_redacted "$EXIT_SYNTHETIC" "synthetic test" psql_in restore_check <"$DB_BACKUP_DIR/synthetic-test.sql"
log "synthetic test ok"
log "VERIFIED: $(basename "$backup") is complete and restorable"
