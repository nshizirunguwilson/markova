import { copyFileSync, existsSync, readFileSync } from 'fs';

/**
 * Installing the branding images a school starts with, without ever
 * destroying the ones it has chosen for itself.
 *
 * `uploads/` is gitignored, so the seed rebuilds it from `assets/` on a fresh
 * clone. It used to do that with a bare `copyFileSync` on every run — which
 * meant a school that had put its own stamp at `uploads/stamp.png` lost it
 * the next time anyone reseeded, silently, with no copy kept anywhere. The
 * config row still read `/uploads/stamp.png`, so nothing looked wrong until
 * somebody printed a letter.
 *
 * The rule here is simple and one-directional: **a file that is already there
 * and differs from what we ship is the school's own, and is never touched.**
 * Only a missing file gets written. That does mean a school never picks up a
 * revised default once it has its own — which is the correct trade: losing a
 * school's stamp is unrecoverable, shipping an old placeholder is not.
 */

export type InstallOutcome =
  /** Nothing was there; the shipped copy was written. */
  | 'installed'
  /** Already there and identical to what we ship. Nothing to do. */
  | 'unchanged'
  /** Already there and different — the school's own. Left alone. */
  | 'kept-existing'
  /** We ship no such file, so there was nothing to install. */
  | 'no-asset';

export interface InstallResult {
  outcome: InstallOutcome;
  /** The URL the config should point at, or '' when there is no file. */
  url: string;
}

/** Just enough of `fs` to be swapped out in a test. */
export interface FileOps {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => Buffer;
  copyFileSync: (from: string, to: string) => void;
}

const realFs: FileOps = { existsSync, readFileSync, copyFileSync };

/**
 * Puts one shipped branding image in place, if and only if doing so cannot
 * destroy something the school chose.
 *
 * `url` comes back whether or not anything was written, because a file that
 * is already there still needs the config pointing at it — that is how a
 * fresh database on an existing install finds the school's own stamp again.
 */
export function installBrandingAsset(
  assetPath: string,
  destinationPath: string,
  url: string,
  fs: FileOps = realFs,
): InstallResult {
  if (!fs.existsSync(assetPath)) {
    // Nothing shipped. If the school has its own file we still point at it.
    return fs.existsSync(destinationPath)
      ? { outcome: 'kept-existing', url }
      : { outcome: 'no-asset', url: '' };
  }

  if (!fs.existsSync(destinationPath)) {
    fs.copyFileSync(assetPath, destinationPath);
    return { outcome: 'installed', url };
  }

  // Both exist. Compare rather than assume: an identical file is our own
  // copy from a previous run and can be left as it is, and anything else
  // belongs to the school.
  const shipped = fs.readFileSync(assetPath);
  const inPlace = fs.readFileSync(destinationPath);
  const same = shipped.length === inPlace.length && shipped.equals(inPlace);

  return { outcome: same ? 'unchanged' : 'kept-existing', url };
}

/**
 * Should the seed write this config value, given what is already stored?
 *
 * Branding keys are the school's to set. Once one holds a value, the seed
 * leaves it: reseeding is for rebuilding demo records, not for reverting a
 * school's identity to the demo's. An empty or missing value is not a choice,
 * so that still gets the default.
 *
 * Everything else the seed owns outright — a demo database is expected to
 * come back with demo terms, thresholds and names.
 */
export const SCHOOL_OWNED_KEYS = [
  'logo_url',
  'stamp_url',
  'signature_url',
] as const;

export function shouldWriteConfig(
  key: string,
  existingValue: string | null | undefined,
): boolean {
  if (!SCHOOL_OWNED_KEYS.includes(key as (typeof SCHOOL_OWNED_KEYS)[number])) {
    return true;
  }
  return !existingValue || existingValue.trim() === '';
}
