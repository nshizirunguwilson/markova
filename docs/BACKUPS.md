# Backups

A school cannot regenerate its marks. This is the part of the system where
losing data is not an incident but the end of the product, so it gets its own
document.

## The rule

**A backup nobody has restored from is a hypothesis.** Everything below is
built around proving the file on disk is a database, not that a file exists.

## Taking one

```bash
./scripts/backup.sh                    # into ./backups
BACKUP_DIR=/mnt/nas ./scripts/backup.sh
KEEP_DAYS=90 ./scripts/backup.sh
```

Two things are saved, and both are needed:

| What | Why |
| --- | --- |
| `database.dump` | Marks, attendance, fees, the whole record. Custom format, so `pg_restore` can read one table out of it. |
| `uploads.tar.gz` | Crests, stamps, signatures and photographs. **Not in the database.** A database-only backup restores a school whose report cards have no signatures and nothing to regenerate them from. |

`MANIFEST` is written last, so its presence is what marks a backup complete.
A directory without one failed part way through, and `restore.sh` refuses it
rather than restoring a truncated dump over a working database.

## Proving it works

```bash
./scripts/restore.sh --check latest
```

This restores into a scratch database beside the real one, counts what came
back, and drops it again. Nothing that matters is touched.

```
  What came back:
    users            2478
    students         1279
    term_results     6885
    marks            268127
    attendances      177190

  The backup restores. Scratch database dropped.
```

Run this on a schedule, not once. A backup pipeline fails silently far more
often than it fails loudly.

## Restoring for real

```bash
./scripts/restore.sh latest
```

It asks you to type the database name before doing anything, and takes a
safety copy of the current state first, so a restore of the wrong backup is
recoverable. Restart the API afterwards so it reconnects with a clean pool.

## Automatically

The `full` compose profile runs a `backup` service that does the same thing
nightly at 02:00 UTC, into the same `./backups` directory:

```bash
docker compose --profile full up -d
```

It is part of the stack rather than a host cron job on purpose: a backup that
lives in somebody's crontab stops when the server is rebuilt, and nobody finds
out until the day it is needed.

## Off site

A backup on the same machine survives a dropped table, a bad migration and a
botched deploy. It does not survive the disk, the machine, or the building, and
those are the cases where a school loses a term of marks for good.

Set `BACKUP_SYNC_CMD` to whatever the school actually uses. `{}` is replaced
with the path of the backup just taken:

```bash
BACKUP_SYNC_CMD='rclone copy {} remote:markova/' ./scripts/backup.sh
BACKUP_SYNC_CMD='rsync -a {} backup@nas:/markova/' ./scripts/backup.sh
BACKUP_SYNC_CMD='aws s3 sync {} s3://markova-backups/' ./scripts/backup.sh
```

A command rather than a provider, deliberately. A school might have a NAS in
the next room, a bucket, or somebody's external drive, and choosing one of
those for them would mean the ones who use anything else get nothing.

**A failed copy is loud and exits non-zero**, so whatever runs this on a
schedule can tell a real backup from a local-only one. Left silent, somebody
would believe they had an off-site copy for months and find out on the day it
mattered.

When it works, the manifest records it:

```
offsite:   2026-08-31T02:00:11Z
```

## What is still missing

**A monitored failure.** The container logs `backup FAILED` and exits non-zero,
and nothing is watching for it. That line should page somebody.
