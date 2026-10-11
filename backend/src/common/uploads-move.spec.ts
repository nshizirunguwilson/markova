import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  moveUploadsPerSchool,
  schoolAddress,
  type MoveDb,
} from './uploads-move';

/**
 * Moving the files saved before schools had folders. Run against a
 * temporary folder and a database that answers from a table in memory.
 */
describe('moving old uploads into their school', () => {
  let root: string;

  /* users.photo_url and discipline_appeals.evidence_urls, in memory. */
  const fakeDb = (rows: {
    users: { id: string; school_id: string; url: string }[];
    appeals: { id: string; school_id: string; urls: string[] }[];
  }) => {
    const db = {
      updates: [] as unknown[][],
      $queryRawUnsafe(query: string): Promise<unknown[]> {
        if (query.includes('FROM "users"') && query.includes('photo_url')) {
          return Promise.resolve(
            rows.users.filter(
              (r) =>
                r.url.startsWith('/uploads/') &&
                !r.url.startsWith('/uploads/schools/'),
            ),
          );
        }
        if (query.includes('FROM "discipline_appeals"')) {
          return Promise.resolve(rows.appeals);
        }
        return Promise.resolve([]);
      },
      $executeRawUnsafe(query: string, ...values: unknown[]) {
        db.updates.push([query, ...values]);
        return Promise.resolve(1);
      },
    };
    return db as typeof db & MoveDb;
  };

  const put = (path: string) => {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, 'x');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'markova-move-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('names the same file inside the school folder', () => {
    expect(schoolAddress('kh', '/uploads/photos/a.png')).toBe(
      '/uploads/schools/kh/photos/a.png',
    );
  });

  it('moves the file and rewrites the address', async () => {
    put('photos/a.png');
    const db = fakeDb({
      users: [{ id: 'u1', school_id: 'kh', url: '/uploads/photos/a.png' }],
      appeals: [],
    });
    const report = await moveUploadsPerSchool(db, root);
    expect(existsSync(join(root, 'schools/kh/photos/a.png'))).toBe(true);
    expect(existsSync(join(root, 'photos/a.png'))).toBe(false);
    expect(db.updates[0].slice(1)).toEqual([
      '/uploads/schools/kh/photos/a.png',
      'u1',
    ]);
    expect(report).toMatchObject({
      rows: 1,
      filesCopied: 1,
      originalsRemoved: 1,
    });
  });

  /* A file two schools point at ends up in both folders. */
  it('gives each school its own copy of a shared file', async () => {
    put('logo.png');
    const db = fakeDb({
      users: [
        { id: 'u1', school_id: 'kh', url: '/uploads/logo.png' },
        { id: 'u2', school_id: 'lycee', url: '/uploads/logo.png' },
      ],
      appeals: [],
    });
    await moveUploadsPerSchool(db, root);
    expect(existsSync(join(root, 'schools/kh/logo.png'))).toBe(true);
    expect(existsSync(join(root, 'schools/lycee/logo.png'))).toBe(true);
  });

  it('rewrites only the old addresses in a list', async () => {
    put('attachments/e.jpg');
    const db = fakeDb({
      users: [],
      appeals: [
        {
          id: 'a1',
          school_id: 'kh',
          urls: ['/uploads/attachments/e.jpg', '/uploads/schools/kh/x.png'],
        },
      ],
    });
    await moveUploadsPerSchool(db, root);
    expect(db.updates[0][1]).toEqual([
      '/uploads/schools/kh/attachments/e.jpg',
      '/uploads/schools/kh/x.png',
    ]);
  });

  it('changes nothing on a dry run', async () => {
    put('photos/a.png');
    const db = fakeDb({
      users: [{ id: 'u1', school_id: 'kh', url: '/uploads/photos/a.png' }],
      appeals: [],
    });
    const report = await moveUploadsPerSchool(db, root, { dryRun: true });
    expect(report.rows).toBe(1);
    expect(db.updates).toEqual([]);
    expect(existsSync(join(root, 'photos/a.png'))).toBe(true);
    expect(existsSync(join(root, 'schools'))).toBe(false);
  });

  it('still rewrites an address whose file is gone, and says so', async () => {
    const lines: string[] = [];
    const db = fakeDb({
      users: [{ id: 'u1', school_id: 'kh', url: '/uploads/photos/gone.png' }],
      appeals: [],
    });
    const report = await moveUploadsPerSchool(db, root, {
      log: (l) => lines.push(l),
    });
    expect(report.filesMissing).toBe(1);
    expect(lines.join('\n')).toContain('missing on disk');
    expect(db.updates).toHaveLength(1);
  });
});
