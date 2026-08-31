#!/usr/bin/env bash
#
# Takes a backup of everything a school cannot regenerate.
#
#   ./scripts/backup.sh                 # write into ./backups
#   BACKUP_DIR=/mnt/nas ./scripts/backup.sh
#
# Two things go in, and both are needed for a working restore:
#
#   the database    marks, attendance, fees, the whole record
#   the uploads     crests, stamps, signatures and photographs
#
# The uploads matter more than they look. They are not in the database, so a
# database-only backup restores a school whose report cards have no signatures
# and no crest on them, and there is nothing to regenerate them from.
#
# Exits non-zero on any failure, and never leaves a half-written file behind
# under the real name: everything is written to a temporary name and moved into
# place only once it is complete. A backup that looks fine and is truncated is
# worse than no backup, because you stop looking.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
CONTAINER="${POSTGRES_CONTAINER:-markova-postgres}"
DB_USER="${POSTGRES_USER:-markova}"
DB_NAME="${POSTGRES_DB:-markova}"
UPLOAD_DIR="${UPLOAD_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backend/uploads}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/$stamp"
mkdir -p "$target"

say() { printf '  %s\n' "$*"; }

echo "Backing up to $target"

# ── database ────────────────────────────────────────────────────────────────
#
# Custom format (-Fc) rather than plain SQL: it is compressed, and pg_restore
# can read it selectively, which is what you want at three in the morning when
# only one table needs putting back.
say "database..."
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
    > "$target/database.dump.part"
else
  # Not in Docker: fall back to a local pg_dump against DATABASE_URL.
  : "${DATABASE_URL:?no $CONTAINER container and no DATABASE_URL to fall back on}"
  pg_dump "$DATABASE_URL" -Fc > "$target/database.dump.part"
fi
mv "$target/database.dump.part" "$target/database.dump"
say "database $(du -h "$target/database.dump" | cut -f1)"

# ── uploads ─────────────────────────────────────────────────────────────────
say "uploads..."
if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$target/uploads.tar.gz.part" -C "$(dirname "$UPLOAD_DIR")" \
    "$(basename "$UPLOAD_DIR")"
  mv "$target/uploads.tar.gz.part" "$target/uploads.tar.gz"
  say "uploads $(du -h "$target/uploads.tar.gz" | cut -f1)"
else
  say "no upload directory at $UPLOAD_DIR, skipping"
fi

# ── a note to whoever is restoring ──────────────────────────────────────────
#
# Written last, so its presence is what marks the backup complete. A directory
# without it is one that failed part way, and the restore script refuses it.
cat > "$target/MANIFEST" <<MANIFEST
taken:     $stamp
host:      $(hostname)
database:  $DB_NAME
postgres:  $(docker exec "$CONTAINER" postgres --version 2>/dev/null || echo unknown)
restore:   ./scripts/restore.sh $stamp
MANIFEST

# ── retention ───────────────────────────────────────────────────────────────
#
# Old backups are removed only after the new one is complete, so there is never
# a moment with nothing on disk.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" \
  -exec rm -rf {} + 2>/dev/null || true

echo "Done. $(ls -1 "$BACKUP_DIR" | wc -l | tr -d ' ') backup(s) kept, $KEEP_DAYS day retention."
echo
echo "This is not a backup until you have restored from it. Run:"
echo "  ./scripts/restore.sh --check $stamp"
