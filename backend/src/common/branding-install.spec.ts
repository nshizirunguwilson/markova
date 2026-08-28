import {
  SCHOOL_OWNED_KEYS,
  installBrandingAsset,
  shouldWriteConfig,
  type FileOps,
} from './branding-install';

/**
 * A stand-in filesystem holding whatever the test says is on disk.
 */
function disk(files: Record<string, string>) {
  const copies: [string, string][] = [];
  const ops: FileOps = {
    existsSync: (p) => Object.hasOwn(files, p),
    readFileSync: (p) => Buffer.from(files[p] ?? ''),
    copyFileSync: (from, to) => {
      copies.push([from, to]);
      files[to] = files[from];
    },
  };
  return { ops, copies, files };
}

const ASSET = '/repo/assets/stamp.png';
const DEST = '/repo/uploads/stamp.png';
const URL = '/uploads/stamp.png';

describe('installing a branding image the school starts with', () => {
  it('writes it when nothing is there', () => {
    const d = disk({ [ASSET]: 'shipped' });
    const r = installBrandingAsset(ASSET, DEST, URL, d.ops);

    expect(r).toEqual({ outcome: 'installed', url: URL });
    expect(d.copies).toEqual([[ASSET, DEST]]);
  });

  it('leaves an identical copy from a previous run alone', () => {
    const d = disk({ [ASSET]: 'shipped', [DEST]: 'shipped' });
    const r = installBrandingAsset(ASSET, DEST, URL, d.ops);

    expect(r.outcome).toBe('unchanged');
    expect(d.copies).toEqual([]);
  });

  /**
   * The whole point. A school put its own stamp at this path; reseeding used
   * to overwrite it with the placeholder, silently, with no copy kept.
   */
  it('never overwrites a file the school replaced', () => {
    const d = disk({ [ASSET]: 'shipped', [DEST]: "the school's own stamp" });
    const r = installBrandingAsset(ASSET, DEST, URL, d.ops);

    expect(r.outcome).toBe('kept-existing');
    expect(d.copies).toEqual([]);
    expect(d.files[DEST]).toBe("the school's own stamp");
  });

  // Same bytes, different length, and the reverse: both must compare as
  // different without throwing.
  it('compares contents, not just length', () => {
    const d = disk({ [ASSET]: 'aaaa', [DEST]: 'bbbb' });
    expect(installBrandingAsset(ASSET, DEST, URL, d.ops).outcome).toBe(
      'kept-existing',
    );
  });

  /**
   * A file already in place still needs the config pointing at it — that is
   * how a rebuilt database on an existing install finds the school's own
   * stamp again instead of coming back blank.
   */
  it('still answers with the url when it wrote nothing', () => {
    const d = disk({ [ASSET]: 'shipped', [DEST]: 'theirs' });
    expect(installBrandingAsset(ASSET, DEST, URL, d.ops).url).toBe(URL);
  });

  // A missing asset used to leave an empty config value, which renders a
  // blank crest and an unsigned letter rather than an error.
  it('answers with no url when nothing ships and nothing is there', () => {
    const d = disk({});
    expect(installBrandingAsset(ASSET, DEST, URL, d.ops)).toEqual({
      outcome: 'no-asset',
      url: '',
    });
  });

  it('keeps the school file even when we ship nothing at all', () => {
    const d = disk({ [DEST]: 'theirs' });
    const r = installBrandingAsset(ASSET, DEST, URL, d.ops);

    expect(r).toEqual({ outcome: 'kept-existing', url: URL });
    expect(d.files[DEST]).toBe('theirs');
  });
});

/**
 * Reseeding rebuilds demo records. It is not licence to revert a school's
 * identity to the demo's.
 */
describe('which config values the seed may write', () => {
  it('leaves branding a school has already set', () => {
    for (const key of SCHOOL_OWNED_KEYS) {
      expect(shouldWriteConfig(key, '/uploads/branding/theirs.png')).toBe(
        false,
      );
    }
  });

  // An empty value is not a choice; it is a school that has not got to it.
  it('fills branding in when it is empty or missing', () => {
    for (const key of SCHOOL_OWNED_KEYS) {
      expect(shouldWriteConfig(key, '')).toBe(true);
      expect(shouldWriteConfig(key, '   ')).toBe(true);
      expect(shouldWriteConfig(key, null)).toBe(true);
      expect(shouldWriteConfig(key, undefined)).toBe(true);
    }
  });

  // A demo database is expected to come back with demo terms and thresholds.
  it('still owns everything that is not branding', () => {
    expect(shouldWriteConfig('school_name', 'Some Other School')).toBe(true);
    expect(shouldWriteConfig('pass_threshold', '70')).toBe(true);
    expect(shouldWriteConfig('starting_discipline_points', '100')).toBe(true);
  });

  it('guards exactly the three branding images', () => {
    expect([...SCHOOL_OWNED_KEYS].sort()).toEqual([
      'logo_url',
      'signature_url',
      'stamp_url',
    ]);
  });
});
