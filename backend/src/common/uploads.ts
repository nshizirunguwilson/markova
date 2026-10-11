import { existsSync, mkdirSync, renameSync } from 'fs';
import { join, resolve } from 'path';
import { diskStorage } from 'multer';
import type { Request } from 'express';

import { retireStoredFile } from './file-validation';

/**
 * Where uploaded files live: a folder per school.
 *
 * Step 3, part 4 of docs/MULTI-SCHOOL-DESIGN.md. Every school's photographs,
 * signatures, crest and chat attachments sit under
 * `uploads/schools/<school id>/<kind>/`, served at the same path under
 * `/uploads`. One folder per school is what lets a school be backed up,
 * restored, measured or removed on its own (steps 5 and 6) without picking
 * its files out of everybody else's.
 *
 * The school is the one the signed-in person is in, read from the request,
 * never from anything the client sends.
 */
export type UploadKind =
  'branding' | 'photos' | 'signatures' | 'attachments' | 'replaced';

/** The root on disk, served at `/uploads`. UPLOAD_DIR may be absolute. */
export const uploadRoot = () =>
  resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

/** One school's folder for one kind of file, on disk and as an address. */
export function schoolUploads(schoolId: string, kind: UploadKind) {
  return {
    dir: join(uploadRoot(), 'schools', schoolId, kind),
    url: `/uploads/schools/${schoolId}/${kind}`,
  };
}

/** The address a stored file is served at. */
export const uploadUrl = (
  schoolId: string,
  kind: UploadKind,
  filename: string,
) => `${schoolUploads(schoolId, kind).url}/${filename}`;

/** The file on disk behind an `/uploads/...` address. */
export const diskPathFor = (url: string) =>
  join(uploadRoot(), url.replace(/^\/?uploads\//, ''));

/** The school of the person making the request, or an error. */
export function requestSchool(
  req: Pick<Request, 'user'> & { user?: { schoolId?: string } },
): string {
  const schoolId = req.user?.schoolId;
  if (!schoolId) throw new Error('There is no school to store this file in');
  return schoolId;
}

/**
 * Multer storage that writes into the signed-in person's school's folder.
 *
 * Guards run before interceptors, so `req.user` is there by the time multer
 * asks where to put the file.
 */
export function schoolStorage(
  kind: UploadKind,
  filename: Parameters<typeof diskStorage>[0]['filename'],
) {
  return diskStorage({
    destination: (req, _file, done) => {
      try {
        const { dir } = schoolUploads(requestSchool(req), kind);
        mkdirSync(dir, { recursive: true });
        done(null, dir);
      } catch (error) {
        done(error as Error, '');
      }
    },
    filename,
  });
}

/**
 * Move a file a record no longer points at into its school's `replaced`
 * folder, rather than deleting it. See retireStoredFile.
 */
export function retireSchoolFile(
  schoolId: string,
  fileUrl: string | null | undefined,
) {
  return retireStoredFile(
    fileUrl,
    { existsSync, mkdirSync, renameSync },
    diskPathFor,
    undefined,
    schoolUploads(schoolId, 'replaced').url,
  );
}
