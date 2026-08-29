# Markova Database Backup - Setup Guide

## Prerequisites

- PostgreSQL client tools (`pg_dump`) installed on the server
- Write access to `/var/backups/markova/` and `/var/log/`
- The backend `.env` file at `backend/.env` (or `DATABASE_URL` set in the environment)

## Quick start

```bash
# One-time setup: create the backup directory and log file
sudo mkdir -p /var/backups/markova
sudo chown $(whoami) /var/backups/markova

sudo touch /var/log/markova-backup.log
sudo chown $(whoami) /var/log/markova-backup.log

# Make the script executable
chmod +x /Users/wilson/Work/markova/scripts/backup-db.sh

# Test a manual run
/Users/wilson/Work/markova/scripts/backup-db.sh
```

## Cron job (daily at 02:00)

```bash
crontab -e
```

Add the following line:

```
0 2 * * * /Users/wilson/Work/markova/scripts/backup-db.sh >> /var/log/markova-backup.log 2>&1
```

## Environment variables

All settings have sensible defaults but can be overridden:

| Variable         | Default                              | Description                        |
|------------------|--------------------------------------|------------------------------------|
| `DATABASE_URL`   | read from `backend/.env`             | PostgreSQL connection string       |
| `ENV_FILE`       | `<script_dir>/../backend/.env`       | Path to the `.env` file            |
| `BACKUP_DIR`     | `/var/backups/markova`               | Where backups are stored           |
| `RETENTION_DAYS` | `30`                                 | Days to keep before rotation       |
| `LOG_FILE`       | `/var/log/markova-backup.log`        | Log file path                      |

Example with overrides:

```bash
BACKUP_DIR=/mnt/nas/backups RETENTION_DAYS=60 /Users/wilson/Work/markova/scripts/backup-db.sh
```

## Restoring a backup

```bash
gunzip -c /var/backups/markova/markova_2026-03-21_020000.sql.gz | psql "$DATABASE_URL"
```

## Backup file naming

Files follow the pattern `markova_YYYY-MM-DD_HHMMSS.sql.gz`. The rotation policy deletes files older than `RETENTION_DAYS` days based on file modification time.
