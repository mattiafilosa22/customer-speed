#!/usr/bin/env bash
# Shared helpers for scripts/backup-db.sh and scripts/verify-db-backup.sh.
# Sourced, never executed. Callers run with `set -euo pipefail`.

# Exit codes, one per stage, so callers and tests can tell WHY a run failed.
readonly EXIT_USAGE=2
readonly EXIT_BACKUP=3
readonly EXIT_CHECKSUM=10
readonly EXIT_DECRYPT=11
readonly EXIT_BUNDLE=12
readonly EXIT_RESTORE=13
readonly EXIT_MANIFEST=14
readonly EXIT_SYNTHETIC=15
readonly EXIT_IMAGE=16

DB_BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DB_BACKUP_DIR

log() { printf '[db-backup] %s\n' "$*" >&2; }

# Strip anything that could carry a credential or an internal hostname from
# text that is about to be printed (libpq/pg_dump errors echo the host).
redact() {
  sed -E \
    -e 's#postgres(ql)?://[^[:space:]"'"'"']+#postgresql://***#g' \
    -e 's#(password|PGPASSWORD)=[^[:space:]]+#\1=***#Ig' \
    -e 's#(server at|host) "[^"]*"#\1 "***"#g' \
    -e 's#\(([0-9]{1,3}\.){3}[0-9]{1,3}\)#(***)#g'
}

# die <exit code> <message>
die() {
  local code="$1"
  shift
  printf '[db-backup] ERROR: %s\n' "$*" | redact >&2
  exit "$code"
}

# run_redacted <exit code on failure> <description> <command...>
# Runs a command with its stderr captured, prints that stderr redacted, and
# turns a failure into `die` with the given stage exit code.
run_redacted() {
  local code="$1" what="$2"
  shift 2
  local err rc=0
  err="$(mktemp)"
  "$@" 2>"$err" || rc=$?
  if [ -s "$err" ]; then redact <"$err" >&2; fi
  rm -f "$err"
  if [ "$rc" -ne 0 ]; then die "$code" "$what failed (exit $rc)"; fi
}

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "$EXIT_USAGE" "required command not found: $cmd"
  done
}

require_env() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || die "$EXIT_USAGE" "$name must be set"
  done
}

# Libpq URI without Prisma-only query params (?schema=, ?pgbouncer=), which
# libpq rejects. The value is a secret: never print it.
libpq_url() { printf '%s' "${1%%\?*}"; }

# The passphrase is fed on fd 3 so it never reaches argv, env of children or logs.
gpg_encrypt() { # <in> <out>
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --output "$2" "$1" 3< <(printf '%s' "$BACKUP_PASSPHRASE")
}
gpg_decrypt() { # <in> <out>
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt --output "$2" "$1" 3< <(printf '%s' "$BACKUP_PASSPHRASE")
}
