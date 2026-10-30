#!/usr/bin/env bash
# End-to-end proof of the backup pipeline on FAKE data, never production:
#   source Postgres in Docker → migrations + seed + synthetic rows →
#   backup (dump + encrypt + sha256) → verify (decrypt + restore + compare) →
#   negative cases, each of which must fail at its own stage.
#
#   pnpm db:backup:test
#
# SOURCE_IMAGE      source server image (default postgres:15, Supabase's major).
#                   With supabase/postgres the real Supabase roles/grants are used;
#                   with vanilla postgres they are recreated here.
# SOURCE_SUPERUSER  superuser of SOURCE_IMAGE (postgres; supabase_admin for supabase/postgres)
# VERIFY_IMAGE / VERIFY_SUPERUSER  throwaway restore server (default: same as source)
# Exit 0 only if the happy path verifies AND every negative case fails as expected.
set -euo pipefail
umask 077

repo="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=common.sh
source "$repo/scripts/db-backup/common.sh"
require_cmd docker pnpm gpg tar sha256sum

source_image="${SOURCE_IMAGE:-postgres:15}"
source_superuser="${SOURCE_SUPERUSER:-postgres}"
export PG_IMAGE="${VERIFY_IMAGE:-$source_image}"
export PG_SUPERUSER="${VERIFY_SUPERUSER:-$source_superuser}"

work="$(mktemp -d)"
container="db-backup-source-$$-$RANDOM"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || log "could not remove $container"
  rm -rf "$work"
}
trap cleanup EXIT

password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
log "starting fake source database ($source_image)"
docker run -d --name "$container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD="$password" "$source_image" >/dev/null
ready=""
for _ in $(seq 1 90); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U "$source_superuser" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ -n "$ready" ] || die 1 "source database did not start"
port="$(docker port "$container" 5432/tcp | head -n 1 | sed 's/.*://')"
admin_sql() { docker exec -i -e PGPASSWORD="$password" "$container" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$source_superuser" -d postgres "$@"; }

# Supabase look-alike: API roles with Supabase's default table privileges.
admin_sql <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator NOINHERIT LOGIN; CREATE ROLE supabase_admin NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  END IF;
END $$;
SQL

export DATABASE_URL="postgresql://postgres:$password@127.0.0.1:$port/postgres?schema=public"
log "applying all Prisma migrations and seeding fake data"
(cd "$repo" && run_redacted 1 "migrate deploy" pnpm -s prisma migrate deploy >/dev/null)
(cd "$repo" && SEED_FABIO_PASSWORD="fake-$RANDOM-Pass!1" SEED_SUPERADMIN_PASSWORD="fake-$RANDOM-Pass!1" \
  run_redacted 1 "seed" pnpm -s db:seed >/dev/null)
admin_sql <<'SQL' >/dev/null
INSERT INTO "ChatActivityDay"(id, "organizationId", date, "updatedAt", "welcomeSent", "welcomeReplies", "inboundReceived")
SELECT 'fake-' || o.id || '-' || g, o.id, date '2024-01-01' + g, now(), (random() * 100)::int, (random() * 150)::int, (random() * 30)::int
FROM "Organization" o, generate_series(0, 699) g;
SQL

export BACKUP_PASSPHRASE
BACKUP_PASSPHRASE="$(head -c 32 /dev/urandom | base64)"
export BACKUP_OUT_DIR="$work/out"

failures=0
results=()
record() { results+=("$(printf '%-44s expected %-9s got %-4s %s' "$1" "$2" "$3" "$4")"); }

# expect <name> <expected exit> <command...>
expect() {
  local name="$1" want="$2" rc=0
  shift 2
  log "── $name"
  "$@" >"$work/last.log" 2>&1 || rc=$?
  cat "$work/last.log" >>"$work/all.log"
  sed 's/^/   │ /' "$work/last.log" | tail -n 12 >&2
  if { [ "$want" = "0" ] && [ "$rc" -eq 0 ]; } || { [ "$want" != "0" ] && [ "$rc" -eq "$want" ]; }; then
    record "$name" "exit=$want" "$rc" "PASS"
  else
    record "$name" "exit=$want" "$rc" "FAIL"
    failures=$((failures + 1))
  fi
}

backup() { "$repo/scripts/backup-db.sh" "$1"; }
verify() { "$repo/scripts/verify-db-backup.sh" "$1"; }
latest() { ls -t "$BACKUP_OUT_DIR"/"$1"-*.backup.tar.gpg | head -n 1; }
copy_case() { # <source backup> <case name> → path of a private copy
  mkdir -p "$work/$2"
  cp "$1" "$1.sha256" "$work/$2/"
  printf '%s' "$work/$2/$(basename "$1")"
}
reseal() { # <backup> : re-encrypt $work/edit/{db.dump,manifest.txt} into <backup> with a fresh checksum
  tar -C "$work/edit" -cf "$work/edit.tar" db.dump manifest.txt
  rm -f "$1"
  gpg_encrypt "$work/edit.tar" "$1"
  (cd "$(dirname "$1")" && sha256sum "$(basename "$1")" >"$(basename "$1").sha256")
}
unseal() { # <backup> → $work/edit/{db.dump,manifest.txt}
  rm -rf "$work/edit" && mkdir -p "$work/edit"
  gpg_decrypt "$1" "$work/edit.tar"
  tar -C "$work/edit" -xf "$work/edit.tar"
}

# Happy path: backup, then full verification.
expect "backup (dump+manifest+encrypt+sha256)" 0 backup roundtrip
good="$(latest roundtrip)"
expect "verify: decrypt+restore+manifest+synthetic" 0 verify "$good"

# N1: checksum file altered.
f="$(copy_case "$good" n1)"
first="$(cut -c1 "$f.sha256")"
if [ "$first" = "0" ]; then swap=1; else swap=0; fi
sed -i "s/^./$swap/" "$f.sha256" # still a well-formed sha256 line, just the wrong hash
expect "N1 checksum altered" "$EXIT_CHECKSUM" verify "$f"

# N2: ciphertext altered, checksum left as is.
f="$(copy_case "$good" n2)"
printf '\xff' | dd of="$f" bs=1 seek=$(( $(stat -c %s "$f") / 2 )) conv=notrunc status=none
expect "N2 backup file corrupted" "$EXIT_CHECKSUM" verify "$f"

# N3: wrong key.
f="$(copy_case "$good" n3)"
expect "N3 wrong passphrase" "$EXIT_DECRYPT" env BACKUP_PASSPHRASE="wrong-$RANDOM" "$repo/scripts/verify-db-backup.sh" "$f"

# N4: tampered ciphertext with a matching checksum (attacker recomputed sha256).
f="$(copy_case "$good" n4)"
printf '\xff' | dd of="$f" bs=1 seek=$(( $(stat -c %s "$f") / 2 )) conv=notrunc status=none
(cd "$(dirname "$f")" && sha256sum "$(basename "$f")" >"$(basename "$f").sha256")
expect "N4 ciphertext forged (sha256 recomputed)" "$EXIT_DECRYPT" verify "$f"

# N5: restore fails — dump truncated, all checksums made consistent.
f="$(copy_case "$good" n5)"
unseal "$f"
head -c $(( $(stat -c %s "$work/edit/db.dump") * 3 / 4 )) "$work/edit/db.dump" >"$work/edit/db.cut" && mv "$work/edit/db.cut" "$work/edit/db.dump"
sed -i "s/^dumpsha|.*/dumpsha|$(sha256sum "$work/edit/db.dump" | cut -d' ' -f1)/" "$work/edit/manifest.txt"
reseal "$f"
expect "N5 restore failed (truncated dump)" "$EXIT_RESTORE" verify "$f"

# N6: restored data differs from the source manifest (one row count off).
f="$(copy_case "$good" n6)"
unseal "$f"
awk -F'|' 'BEGIN { OFS = "|" } $1 == "rows" && $2 == "ChatActivityDay" { $3 = $3 + 1 } { print }' \
  "$work/edit/manifest.txt" >"$work/edit/m" && mv "$work/edit/m" "$work/edit/manifest.txt"
reseal "$f"
expect "N6 row count mismatch" "$EXIT_MANIFEST" verify "$f"

# N7: synthetic test fails — the source itself has a table without RLS, so
# the restored copy faithfully reproduces an unsafe state.
admin_sql -c 'ALTER TABLE "Lead" DISABLE ROW LEVEL SECURITY' >/dev/null
expect "backup of a source with RLS off on Lead" 0 backup unsafe
admin_sql -c 'ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY' >/dev/null
expect "N7 synthetic test failed" "$EXIT_SYNTHETIC" verify "$(latest unsafe)"

# C1: backup while the application keeps writing. Dump and manifest share one
# snapshot, so verification must still match exactly.
writer() {
  local i
  for i in $(seq 1 150); do
    admin_sql -c "INSERT INTO \"ChatActivityDay\"(id, \"organizationId\", date, \"updatedAt\") SELECT 'live-$i', id, date '2030-01-01' + $i, now() FROM \"Organization\" LIMIT 1" >/dev/null
  done
}
writer &
writer_pid=$!
expect "C1 backup during concurrent writes" 0 backup concurrent
wait "$writer_pid" || die 1 "the concurrent writer failed"
expect "C1 verify: manifest still identical" 0 verify "$(latest concurrent)"

# N9: wrong credentials — must fail without leaking the URL or the password.
expect "N9 backup with wrong DB password" "$EXIT_BACKUP" \
  env DATABASE_URL="postgresql://postgres:WrongSecret-$RANDOM@127.0.0.1:$port/postgres" "$repo/scripts/backup-db.sh" badcreds
grep -q 'password authentication failed' "$work/last.log" || die 1 "N9 failed for an unexpected reason"

# N8: missing secret.
expect "N8 backup without BACKUP_PASSPHRASE" "$EXIT_USAGE" env -u BACKUP_PASSPHRASE "$repo/scripts/backup-db.sh" nokey

# No secret may ever appear in any output.
leaks=0
for secret in "$password" "$BACKUP_PASSPHRASE" "WrongSecret-" "postgresql://postgres:"; do
  if grep -qF -- "$secret" "$work/all.log"; then leaks=$((leaks + 1)); fi
done
if [ "$leaks" -eq 0 ]; then
  record "secret scan: URL/passwords/passphrase in logs" "none" "0" "PASS"
else
  record "secret scan: URL/passwords/passphrase in logs" "none" "$leaks" "FAIL"
  failures=$((failures + 1))
fi

printf '\n%s\n' "RESULTS" >&2
printf '  %s\n' "${results[@]}" >&2
if [ "$failures" -ne 0 ]; then
  die 1 "$failures case(s) did not behave as expected"
fi
log "all cases behaved as expected"
