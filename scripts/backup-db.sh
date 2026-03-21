#!/usr/bin/env bash
#
# Markova School Management System - Database Backup Script
# Creates compressed PostgreSQL backups and rotates old ones.
# Designed for unattended cron execution.
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/var/backups/markova}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../backend/.env}"
LOG_FILE="${LOG_FILE:-/var/log/markova-backup.log}"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="markova_${TIMESTAMP}.sql.gz"

# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------
log() {
    local level="$1"; shift
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
    echo "$msg"
    # Append to log file if writable
    if [ -w "$(dirname "$LOG_FILE")" ] || [ -w "$LOG_FILE" ]; then
        echo "$msg" >> "$LOG_FILE"
    fi
}

# ---------------------------------------------------------------------------
# Resolve DATABASE_URL
# ---------------------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
    if [ -f "$ENV_FILE" ]; then
        DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
    fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
    log "ERROR" "DATABASE_URL is not set and could not be read from ${ENV_FILE}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Parse DATABASE_URL into pg_dump connection parameters
# Format: postgresql://user:password@host:port/dbname
# ---------------------------------------------------------------------------
# Strip the scheme
_stripped="${DATABASE_URL#postgresql://}"
_stripped="${_stripped#postgres://}"

_userpass="${_stripped%%@*}"
_hostportdb="${_stripped#*@}"

PGUSER="${_userpass%%:*}"
PGPASSWORD="${_userpass#*:}"

_hostport="${_hostportdb%%/*}"
PGDATABASE="${_hostportdb#*/}"

PGHOST="${_hostport%%:*}"
PGPORT="${_hostport#*:}"
# Default port if none specified
if [ "$PGPORT" = "$PGHOST" ]; then
    PGPORT="5432"
fi

export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE

# ---------------------------------------------------------------------------
# Ensure backup directory exists
# ---------------------------------------------------------------------------
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
    log "ERROR" "Cannot create backup directory: ${BACKUP_DIR}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Perform backup
# ---------------------------------------------------------------------------
log "INFO" "Starting backup of database '${PGDATABASE}' to ${BACKUP_DIR}/${BACKUP_FILE}"

if pg_dump --no-owner --no-acl --format=plain | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"; then
    FILESIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
    log "INFO" "Backup completed successfully (${FILESIZE}): ${BACKUP_DIR}/${BACKUP_FILE}"
else
    log "ERROR" "pg_dump failed for database '${PGDATABASE}'"
    # Remove partial file if it exists
    rm -f "${BACKUP_DIR}/${BACKUP_FILE}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Rotate old backups — keep last RETENTION_DAYS days
# ---------------------------------------------------------------------------
DELETED=$(find "$BACKUP_DIR" -name "markova_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
if [ "$DELETED" -gt 0 ]; then
    log "INFO" "Rotated ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

log "INFO" "Backup process finished"
