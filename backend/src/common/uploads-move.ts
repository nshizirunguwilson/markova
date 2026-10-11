import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Move the files saved before schools had folders into their school's folder.
 *
 * Once, on an install that was running before step 3, part 4. Every address
 * the database holds that points at a file under `/uploads/` but not yet
 * under `/uploads/schools/` is rewritten to the same file inside the folder
 * of the school that owns the row, and the file goes with it.
 *
 * Safe to stop and run again. Each file is copied before the row that points
 * at it is changed, and the originals are removed only at the very end, once
 * every row has its new address. A second run finds nothing left to do.
 *
 * Runs as the database owner (below the wall between schools): it has to see
 * every school's rows, and it reads only addresses.
 */
export interface MoveDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/** Every column that can hold the address of an uploaded file. */
export const FILE_COLUMNS = [
  { table: 'users', column: 'photo_url' },
  { table: 'users', column: 'signature_url' },
  { table: 'school_configs', column: 'value' },
  { table: 'messages', column: 'file_url' },
  { table: 'homework_submissions', column: 'file_url' },
  { table: 'support_tickets', column: 'screenshot_url' },
  { table: 'application_documents', column: 'file_url' },
] as const;
/** The one column holding a list of addresses. */
export const FILE_LIST_COLUMN = {
  table: 'discipline_appeals',
  column: 'evidence_urls',
} as const;

const LEGACY = (url: unknown): url is string =>
  typeof url === 'string' &&
  url.startsWith('/uploads/') &&
  !url.startsWith('/uploads/schools/');

/** The address a legacy file has inside its school's folder. */
export const schoolAddress = (schoolId: string, url: string) =>
  `/uploads/schools/${schoolId}/${url.slice('/uploads/'.length)}`;

export interface MoveReport {
  rows: number;
  filesCopied: number;
  filesMissing: number;
  originalsRemoved: number;
}

export async function moveUploadsPerSchool(
  db: MoveDb,
  root: string,
  options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<MoveReport> {
  const log = options.log ?? (() => undefined);
  const report: MoveReport = {
    rows: 0,
    filesCopied: 0,
    filesMissing: 0,
    originalsRemoved: 0,
  };
  const originals = new Set<string>();
  const onDisk = (url: string) => join(root, url.replace(/^\/uploads\//, ''));

  /* The file, into its school's folder. Copied, so a second school pointing
     at the same file gets its own copy, and nothing is lost if this stops. */
  const bring = (schoolId: string, url: string): string => {
    const target = schoolAddress(schoolId, url);
    const from = onDisk(url);
    const to = onDisk(target);
    if (existsSync(from)) {
      originals.add(from);
      if (!existsSync(to) && !options.dryRun) {
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
      }
      report.filesCopied++;
    } else if (!existsSync(to)) {
      report.filesMissing++;
      log(`missing on disk: ${url}`);
    }
    return target;
  };

  for (const { table, column } of FILE_COLUMNS) {
    const rows = await db.$queryRawUnsafe<
      { id: string; school_id: string; url: string }[]
    >(
      `SELECT id, school_id, "${column}" AS url FROM "${table}"
       WHERE "${column}" LIKE '/uploads/%'
         AND "${column}" NOT LIKE '/uploads/schools/%'`,
    );
    for (const row of rows) {
      const next = bring(row.school_id, row.url);
      if (!options.dryRun) {
        await db.$executeRawUnsafe(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
          next,
          row.id,
        );
      }
      report.rows++;
    }
    if (rows.length) log(`${table}.${column}: ${rows.length}`);
  }

  {
    const { table, column } = FILE_LIST_COLUMN;
    const rows = await db.$queryRawUnsafe<
      { id: string; school_id: string; urls: string[] }[]
    >(
      `SELECT id, school_id, "${column}" AS urls FROM "${table}"
       WHERE EXISTS (
         SELECT 1 FROM unnest("${column}") AS u
         WHERE u LIKE '/uploads/%' AND u NOT LIKE '/uploads/schools/%'
       )`,
    );
    for (const row of rows) {
      const next = row.urls.map((u) =>
        LEGACY(u) ? bring(row.school_id, u) : u,
      );
      if (!options.dryRun) {
        await db.$executeRawUnsafe(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
          next,
          row.id,
        );
      }
      report.rows++;
    }
    if (rows.length) log(`${table}.${column}: ${rows.length}`);
  }

  /* Every row has its new address; the old copies are no longer pointed at. */
  if (!options.dryRun) {
    for (const file of originals) {
      rmSync(file, { force: true });
      report.originalsRemoved++;
    }
  }
  return report;
}
