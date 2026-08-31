#!/usr/bin/env bash
#
# Puts a backup back, or proves that it would work.
#
#   ./scripts/restore.sh --check 20260831T014500Z   # rehearse, touch nothing
#   ./scripts/restore.sh         20260831T014500Z   # really restore
#   ./scripts/restore.sh --check latest
#
# The --check mode is the reason this script exists. It restores the dump into
# a scratch database beside the real one, counts what came back, and drops it
# again. Nothing that matters is touched, and at the end you know the file on
# disk is a database rather than a file that is the right size.
#
# A backup nobody has restored from is a hypothesis. Run --check on a schedule,
# not once.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
CONTAINER="${POSTGRES_CONTAINER:-markova-postgres}"
DB_USER="${POSTGRES_USER:-markova}"
DB_NAME="${POSTGRES_DB:-markova}"
UPLOAD_DIR="${UPLOAD_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backend/uploads}"

CHECK=0
if [ "${1:-}" = "--check" ]; then CHECK=1; shift; fi
WHICH="${1:-latest}"

if [ "$WHICH" = "latest" ]; then
  WHICH="$(ls -1 "$BACKUP_DIR" 2>/dev/null | sort | tail -1 || true)"
  [ -n "$WHICH" ] || { echo "No backups in $BACKUP_DIR"; exit 1; }
fi

src="$BACKUP_DIR/$WHICH"
[ -d "$src" ] || { echo "No backup called $WHICH in $BACKUP_DIR"; exit 1; }

# MANIFEST is written last by backup.sh, so a directory without one is a backup
# that failed part way through. Restoring it would be restoring a truncated
# dump over a working database.
[ -f "$src/MANIFEST" ] || {
  echo "$WHICH has no MANIFEST: it did not finish, and will not be restored."
  exit 1
}

echo "Backup $WHICH"
sed 's/^/  /' "$src/MANIFEST"
echo

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || {
  echo "Postgres container $CONTAINER is not running."
  exit 1
}

if [ "$CHECK" = "1" ]; then
  # ── rehearsal ─────────────────────────────────────────────────────────────
  scratch="restore_check_$(date +%s)"
  echo "Restoring into a scratch database ($scratch). Nothing else is touched."

  cleanup() {
    docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS $scratch" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE $scratch" >/dev/null

  docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$scratch" \
    --no-owner --no-privileges < "$src/database.dump" >/dev/null 2>&1 || true

  echo
  echo "  What came back:"
  for table in users students term_results marks attendances; do
    n=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$scratch" -tAc \
      "SELECT count(*) FROM $table" 2>/dev/null || echo "missing")
    printf '    %-16s %s\n' "$table" "$n"
  done

  users=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$scratch" -tAc \
    "SELECT count(*) FROM users" 2>/dev/null || echo 0)
  echo
  if [ "${users:-0}" -gt 0 ]; then
    echo "  The backup restores. Scratch database dropped."
  else
    echo "  RESTORE FAILED: no users came back. This backup is not usable."
    exit 1
  fi
  exit 0
fi

# ── the real thing ──────────────────────────────────────────────────────────
cat <<WARNING

  This replaces the contents of "$DB_NAME" with the backup taken at $WHICH.
  Everything recorded since then is lost, and every session is signed out.

WARNING
read -r -p "  Type the database name to confirm: " typed
[ "$typed" = "$DB_NAME" ] || { echo "  Not confirmed. Nothing changed."; exit 1; }

echo
echo "  Taking a safety copy of the current state first..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
  > "$BACKUP_DIR/before-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"

echo "  Restoring the database..."
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges < "$src/database.dump" \
  >/dev/null 2>&1 || true

if [ -f "$src/uploads.tar.gz" ]; then
  echo "  Restoring uploads..."
  tar -xzf "$src/uploads.tar.gz" -C "$(dirname "$UPLOAD_DIR")"
fi

echo
echo "  Restored. Restart the API so it reconnects with a clean pool."
