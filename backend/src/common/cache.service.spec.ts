import { CacheKey, CacheService, CacheTtl } from './cache.service';
import { withPlatform, withSchool } from '../prisma/request-context';

/** Inside Kigali Hill, which every case here runs in unless it says not. */
const inKH = <T>(fn: () => Promise<T>) => withSchool('kh', fn);

/**
 * Remembering answers asked for constantly and changed yearly.
 *
 * The rule everything here protects is that the cache never becomes a reason
 * the application fails. A wrong answer or a missing one is a cache bug; an
 * outage because Redis hiccupped is a design mistake.
 */
describe('the cache', () => {
  const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const cache = new CacheService(redis as never);
  const produce = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    produce.mockResolvedValue({ schoolName: 'Markova' });
    redis.get.mockResolvedValue(null);
  });

  it('asks the source on a miss and remembers the answer', async () => {
    const out = await inKH(() => cache.remember('k', 60, produce));
    expect(out).toEqual({ schoolName: 'Markova' });
    expect(redis.set).toHaveBeenCalledWith(
      'school:kh:k',
      JSON.stringify({ schoolName: 'Markova' }),
      'EX',
      60,
    );
  });

  it('does not ask the source at all on a hit', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ schoolName: 'Cached' }));
    expect(await inKH(() => cache.remember('k', 60, produce))).toEqual({
      schoolName: 'Cached',
    });
    expect(produce).not.toHaveBeenCalled();
  });

  it('gives back exactly what went in, not a string of it', async () => {
    const value = { n: 1, nested: { list: [1, 2, 3] }, flag: false };
    produce.mockResolvedValue(value);
    redis.get.mockResolvedValue(null);
    expect(await inKH(() => cache.remember('k', 60, produce))).toEqual(value);
  });

  /*
    The important half. A cache that can take the application down when Redis
    is unreachable is worse than no cache at all, so every path falls back to
    the real source.
  */
  describe('when Redis is unreachable', () => {
    it('still answers, from the source, when the read throws', async () => {
      redis.get.mockRejectedValue(new Error('connection refused'));
      expect(await inKH(() => cache.remember('k', 60, produce))).toEqual({
        schoolName: 'Markova',
      });
    });

    it('still answers when the write throws', async () => {
      redis.set.mockRejectedValue(new Error('connection refused'));
      expect(await inKH(() => cache.remember('k', 60, produce))).toEqual({
        schoolName: 'Markova',
      });
    });

    it('does not fail a user write just because the cache would not clear', async () => {
      redis.del.mockRejectedValue(new Error('connection refused'));
      await expect(inKH(() => cache.forget('k'))).resolves.toBeUndefined();
    });
  });

  /* Cleared on write rather than waiting for the TTL. A school that changes
     its colour and sees the old one for ten minutes will change it again, and
     then twice more. */
  it('drops the key when asked', async () => {
    await inKH(() => cache.forget('k'));
    expect(redis.del).toHaveBeenCalledWith('school:kh:k');
  });

  /*
    The same key names a different answer in each school. Kigali Hill's
    branding must never be what Lycee's sign in page shows.
  */
  describe('with many schools', () => {
    it('keeps each school its own answer', async () => {
      await inKH(() => cache.remember(CacheKey.publicBranding, 60, produce));
      await withSchool('lycee', () =>
        cache.remember(CacheKey.publicBranding, 60, produce),
      );
      expect(redis.get.mock.calls.map((c) => c[0])).toEqual([
        'school:kh:cache:branding:public',
        'school:lycee:cache:branding:public',
      ]);
    });

    it('caches nothing without a school', async () => {
      await cache.remember('k', 60, produce);
      await withPlatform(() => cache.remember('k', 60, produce));
      expect(produce).toHaveBeenCalledTimes(2);
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("clears only the school's own keys", async () => {
      const scan = jest.fn().mockResolvedValue(['0', []]);
      const scoped = new CacheService({ ...redis, scan } as never);
      await inKH(() => scoped.forgetMatching(CacheKey.allTimetables));
      expect(scan.mock.calls[0][2]).toBe('school:kh:cache:timetable:*');
    });

    it('clears nothing without a school', async () => {
      await cache.forget('k');
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  it('keeps the keys in one place, so an invalidation cannot miss one', () => {
    expect(CacheKey.publicBranding).toBe('cache:branding:public');
    expect(CacheTtl.publicBranding).toBeGreaterThan(0);
  });
});
