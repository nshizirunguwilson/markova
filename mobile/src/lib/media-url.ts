import { API_URL } from '@/constants/config';

/**
 * Turns a path the API hands back into something an image can load.
 *
 * Uploads are stored and returned as server paths, `/uploads/photos/x.png`,
 * which a browser resolves against the page it is on. A phone has no page,
 * so expo-image was given a bare path, loaded nothing and drew an empty
 * circle: every student photo and every school crest in the app was blank.
 *
 * Uploads are served beside the API rather than under its `/api` prefix, so
 * the origin is the API address with that suffix taken off.
 */
export function mediaUrl(
  path: string | null | undefined,
  apiUrl: string = API_URL,
): string | null {
  if (!path) return null;
  // Already loadable: a full address, a picked file, a data or blob URI.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const origin = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}
