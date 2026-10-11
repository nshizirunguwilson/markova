import { mkdtempSync, mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  diskPathFor,
  requestSchool,
  retireSchoolFile,
  schoolStorage,
  schoolUploads,
  uploadUrl,
} from './uploads';

/** A folder per school, so a school's files can be kept, moved or removed on their own. */
describe('uploads, a folder per school', () => {
  let root: string;
  const before = process.env.UPLOAD_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'markova-uploads-'));
    process.env.UPLOAD_DIR = root;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (before === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = before;
  });

  it("puts each kind of file under its school's own folder", () => {
    expect(schoolUploads('kh', 'photos')).toEqual({
      dir: join(root, 'schools', 'kh', 'photos'),
      url: '/uploads/schools/kh/photos',
    });
    expect(uploadUrl('lycee', 'attachments', 'a.pdf')).toBe(
      '/uploads/schools/lycee/attachments/a.pdf',
    );
  });

  it('finds the file on disk behind an address', () => {
    expect(diskPathFor('/uploads/schools/kh/photos/a.png')).toBe(
      join(root, 'schools', 'kh', 'photos', 'a.png'),
    );
  });

  it('takes the school from the signed-in person, never the client', () => {
    expect(requestSchool({ user: { schoolId: 'kh' } } as never)).toBe('kh');
    expect(() => requestSchool({} as never)).toThrow(/no school/i);
  });

  it("stores an upload in the uploader's school", (done) => {
    const storage = schoolStorage('photos', (_r, _f, cb) => cb(null, 'x.png'));
    (storage as any).getDestination(
      { user: { schoolId: 'kh' } },
      {},
      (error: Error | null, dir: string) => {
        expect(error).toBeNull();
        expect(dir).toBe(join(root, 'schools', 'kh', 'photos'));
        expect(existsSync(dir)).toBe(true);
        done();
      },
    );
  });

  it('refuses to store an upload with no school', (done) => {
    const storage = schoolStorage('photos', (_r, _f, cb) => cb(null, 'x.png'));
    (storage as any).getDestination({}, {}, (error: Error | null) => {
      expect(error?.message).toMatch(/no school/i);
      done();
    });
  });

  it("retires a replaced file into its own school's folder", () => {
    const old = schoolUploads('kh', 'photos');
    mkdirSync(old.dir, { recursive: true });
    writeFileSync(join(old.dir, 'old.png'), 'x');
    const moved = retireSchoolFile('kh', `${old.url}/old.png`);
    expect(moved).toContain(join(root, 'schools', 'kh', 'replaced'));
    expect(existsSync(join(old.dir, 'old.png'))).toBe(false);
  });
});
