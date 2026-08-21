import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service';

/**
 * The package does not re-export this record type from its entry point, and
 * reaching into `dist/` for it would break on any internal reshuffle. Deriving
 * it from the interface keeps it correct by construction.
 */
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * Rate limit counters kept in Redis instead of in this process's memory.
 *
 * The default storage is a Map on the heap, which makes the counters per
 * instance and wipes them on every restart. Both matter for the limits that do
 * real work: the five-per-minute cap on login lasts exactly as long as the
 * process, so a redeploy hands an attacker a fresh allowance, and a second
 * instance behind a load balancer doubles every limit in the app.
 *
 * Redis is already here for caching and queues, so this adds no new
 * infrastructure.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  /** Used only while Redis is unreachable. See the catch in `increment`. */
  private readonly fallback = new ThrottlerStorageService();
  private warnedAboutFallback = false;

  constructor(private readonly redis: RedisService) {}

  /**
   * One round trip, and atomic, so two requests arriving together cannot both
   * read the same count and both conclude they are under the limit.
   *
   * `ttl` and `blockDuration` arrive in milliseconds. `timeToExpire` and
   * `timeToBlockExpire` go back in seconds, matching the in-memory storage
   * this replaces.
   */
  private static readonly SCRIPT = `
    local hitsKey = KEYS[1]
    local blockKey = KEYS[2]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])

    local blockPttl = redis.call('PTTL', blockKey)
    if blockPttl > 0 then
      local blockedHits = tonumber(redis.call('GET', hitsKey)) or (limit + 1)
      local blockedTtl = redis.call('PTTL', hitsKey)
      if blockedTtl < 0 then blockedTtl = blockPttl end
      return {blockedHits, blockedTtl, 1, blockPttl}
    end

    local hits = redis.call('INCR', hitsKey)
    if hits == 1 then
      redis.call('PEXPIRE', hitsKey, ttl)
    end

    local hitsPttl = redis.call('PTTL', hitsKey)
    if hitsPttl < 0 then
      redis.call('PEXPIRE', hitsKey, ttl)
      hitsPttl = ttl
    end

    if hits > limit then
      local blockFor = blockDuration
      if blockFor <= 0 then blockFor = hitsPttl end
      redis.call('SET', blockKey, '1', 'PX', blockFor)
      return {hits, hitsPttl, 1, blockFor}
    end

    return {hits, hitsPttl, 0, 0}
  `;

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:blocked`;

    try {
      const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] =
        (await this.redis.eval(
          RedisThrottlerStorage.SCRIPT,
          2,
          hitsKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration),
        )) as [number, number, number, number];

      return {
        totalHits,
        timeToExpire: Math.ceil(timeToExpireMs / 1000),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
      };
    } catch (error) {
      // Failing open would drop rate limiting the moment Redis hiccups, and
      // failing closed would take the API down with it. Counting in memory is
      // weaker than Redis and stronger than either of those.
      if (!this.warnedAboutFallback) {
        this.warnedAboutFallback = true;
        this.logger.error(
          `Redis unavailable for rate limiting, counting in memory for now: ${
            (error as Error).message
          }`,
        );
      }
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  /**
   * The in-memory fallback arms a timer per hit. If it was ever used, those
   * timers would otherwise keep the process alive at shutdown.
   */
  onApplicationShutdown(): void {
    this.fallback.onApplicationShutdown();
  }
}
