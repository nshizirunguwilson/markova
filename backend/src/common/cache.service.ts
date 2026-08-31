import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

/**
 * Remembering the answers that are asked for constantly and change yearly.
 *
 * The school's name, colour and crest are fetched by every page load, by
 * everybody, before they have even signed in. They change when a school is set
 * up and then perhaps once more, ever. Going to Postgres for them on every
 * request is a query per page view for an answer that has not moved since
 * February.
 *
 * Cache-aside rather than write-through, because the writes are rare and the
 * reads are not: it is worth nothing to make a once-a-year write faster, and
 * everything to make a per-page-view read cheaper.
 *
 * Fails open, always. A cache that can take the application down when Redis
 * hiccups is worse than no cache, so every path here falls back to asking the
 * real source and the failure is logged rather than thrown.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * The cached value, or the freshly produced one.
   *
   * `produce` is called on a miss and on any Redis trouble at all. It is never
   * skipped, so a caller can treat this as an ordinary function that happens
   * to be fast most of the time.
   */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    produce: () => Promise<T>,
  ): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit !== null && hit !== undefined) return JSON.parse(hit) as T;
    } catch {
      this.logger.warn(`Cache read failed for ${key}, asking the source`);
      return produce();
    }

    const value = await produce();

    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* Produced the value and could not store it. The caller still gets a
         correct answer, which is the only thing that matters here. */
      this.logger.warn(`Cache write failed for ${key}`);
    }
    return value;
  }

  /**
   * Drop a key, so the next read goes to the source.
   *
   * Called on write rather than waiting for the TTL. A school that changes its
   * colour and sees the old one for another ten minutes will change it again,
   * and then twice more.
   */
  async forget(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      /* The TTL will clear it. Worth a line, not worth failing the write that
         the user actually asked for. */
      this.logger.warn(`Could not clear cache key ${key}`);
    }
  }

  /**
   * Drop every key matching a pattern.
   *
   * For the writes that could touch any class: moving a teacher changes the
   * timetable of every class they teach, and working out which ones is more
   * work than clearing them all and letting the next read repopulate.
   *
   * `scan` rather than `keys`, because `keys` blocks Redis for the length of
   * the sweep and Redis is single threaded. On a small keyspace the difference
   * is nothing; on a large one `keys` is an outage.
   */
  async forgetMatching(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, found] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = next;
        if (found.length) await this.redis.del(...found);
      } while (cursor !== '0');
    } catch {
      this.logger.warn(`Could not clear cache keys matching ${pattern}`);
    }
  }
}

/** The keys, in one place, so an invalidation cannot miss one by typo. */
export const CacheKey = {
  publicBranding: 'cache:branding:public',
  /*
    One key per class rather than one for the whole school. A timetable is
    read by every student and teacher in that class, several times a day, and
    changes a handful of times a term; caching them together would mean one
    class's change clearing every other class's answer.
  */
  classTimetable: (classSectionId: string) => `cache:timetable:${classSectionId}`,
  /** Every timetable key, for the case where a change could touch any of them. */
  allTimetables: 'cache:timetable:*',
} as const;

/**
 * How long each answer may be stale.
 *
 * Ten minutes on branding is a compromise between the two failure modes: long
 * enough to take the query off the hot path, short enough that a school which
 * changes its crest and somehow misses the invalidation is not looking at the
 * old one all afternoon.
 */
export const CacheTtl = {
  publicBranding: 600,
  /*
    Five minutes. A timetable changes when the school reorganises it, which is
    a deliberate act followed by somebody checking the screen, so the write
    clears the key and the TTL is only the belt to that braces.
  */
  timetable: 300,
} as const;
