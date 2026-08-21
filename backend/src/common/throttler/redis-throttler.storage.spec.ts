import { RedisThrottlerStorage } from './redis-throttler.storage';
import { RedisService } from '../../redis/redis.service';

describe('RedisThrottlerStorage', () => {
  const makeStorage = (evalImpl: jest.Mock) => {
    const redis = { eval: evalImpl } as unknown as RedisService;
    return new RedisThrottlerStorage(redis);
  };

  it('converts the script’s milliseconds into the seconds the guard expects', async () => {
    // hits, timeToExpire(ms), isBlocked, timeToBlockExpire(ms)
    const evalImpl = jest.fn().mockResolvedValue([3, 45_000, 0, 0]);
    const storage = makeStorage(evalImpl);

    await expect(
      storage.increment('key', 60_000, 100, 0, 'default'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('rounds a part second up, so a limit never expires early', async () => {
    const storage = makeStorage(jest.fn().mockResolvedValue([1, 1, 0, 0]));
    const record = await storage.increment('key', 60_000, 100, 0, 'default');
    expect(record.timeToExpire).toBe(1);
  });

  it('reports a block', async () => {
    const storage = makeStorage(
      jest.fn().mockResolvedValue([101, 30_000, 1, 30_000]),
    );
    const record = await storage.increment('key', 60_000, 100, 0, 'default');
    expect(record).toMatchObject({ isBlocked: true, timeToBlockExpire: 30 });
  });

  it('namespaces the key by throttler so two limits cannot share a counter', async () => {
    const evalImpl = jest.fn().mockResolvedValue([1, 1000, 0, 0]);
    const storage = makeStorage(evalImpl);
    await storage.increment('abc', 60_000, 100, 0, 'login');

    const [, keyCount, hitsKey, blockKey] = evalImpl.mock.calls[0] as [
      string,
      number,
      string,
      string,
    ];
    expect(keyCount).toBe(2);
    expect(hitsKey).toBe('throttle:login:abc');
    expect(blockKey).toBe('throttle:login:abc:blocked');
  });

  // Redis going down must not remove rate limiting, and must not take the API
  // down either.
  it('falls back to counting in memory when Redis fails', async () => {
    const evalImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const storage = makeStorage(evalImpl);

    // The guard always resolves blockDuration to at least the ttl, so that is
    // what the fallback has to cope with.
    const hit = () => storage.increment('key', 60_000, 2, 60_000, 'default');
    const first = await hit();
    const second = await hit();
    const third = await hit();

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(third.isBlocked).toBe(true);
    storage.onApplicationShutdown();
  });

  it('logs the Redis failure once, not once per request', async () => {
    const evalImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const storage = makeStorage(evalImpl);
    const logged = jest
      .spyOn(
        (storage as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await storage.increment('key', 60_000, 100, 0, 'default');
    await storage.increment('key', 60_000, 100, 0, 'default');

    expect(logged).toHaveBeenCalledTimes(1);
    storage.onApplicationShutdown();
  });
});
