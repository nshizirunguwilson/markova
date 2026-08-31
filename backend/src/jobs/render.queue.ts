import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

import { RedisService } from '../redis/redis.service';
import {
  RENDER_QUEUE,
  RESULT_TTL_SECONDS,
  RenderJobName,
  RenderStatus,
} from './jobs.constants';

/**
 * Accepting render work and reporting on it.
 *
 * The controller hands a job here and gets an id back immediately, so the
 * request ends in milliseconds whatever the render costs. The client then asks
 * for the status until it is done and downloads the result.
 *
 * The finished bytes go to Redis rather than back through BullMQ's job return
 * value. Job results are kept in the job record, and a class pack is several
 * megabytes: keeping thirty of those in the queue's own bookkeeping makes the
 * queue slow for everything else. Redis with an expiry keeps it out of the way
 * and cleans up after itself.
 */
@Injectable()
export class RenderQueue {
  constructor(
    @InjectQueue(RENDER_QUEUE) private readonly queue: Queue,
    private readonly redis: RedisService,
  ) {}

  /** Where a finished render is parked, and where progress is written. */
  static resultKey = (id: string) => `render:result:${id}`;
  static statusKey = (id: string) => `render:status:${id}`;

  /**
   * Put work on the queue and return its id.
   *
   * `removeOnComplete` keeps the queue from growing without bound: the bytes
   * live in Redis under their own key with their own expiry, so there is
   * nothing useful left in the job record once it has finished.
   */
  async enqueue(
    name: RenderJobName,
    data: Record<string, unknown>,
    requestedBy: string,
  ): Promise<string> {
    const job = await this.queue.add(
      name,
      { ...data, requestedBy },
      {
        removeOnComplete: true,
        /* Failures are kept for a while, because "it did not work" is a
           support question and the reason has to survive long enough to be
           asked about. */
        removeOnFail: { age: 3600 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    const id = String(job.id);
    await this.write(id, { id, state: 'queued', progress: 0 });
    return id;
  }

  /** Record where a job has got to. Called by the worker as it goes. */
  async write(id: string, status: RenderStatus): Promise<void> {
    await this.redis.set(
      RenderQueue.statusKey(id),
      JSON.stringify(status),
      'EX',
      RESULT_TTL_SECONDS,
    );
  }

  /** Park the finished bytes for the client to collect. */
  async store(id: string, buffer: Buffer): Promise<void> {
    await this.redis.set(
      RenderQueue.resultKey(id),
      buffer.toString('base64'),
      'EX',
      RESULT_TTL_SECONDS,
    );
  }

  async status(id: string): Promise<RenderStatus> {
    const raw = await this.redis.get(RenderQueue.statusKey(id));
    if (!raw) {
      /* Either it never existed or it has expired. The client cannot tell the
         difference and does not need to: both mean ask for it again. */
      throw new NotFoundException(
        'That download is no longer available. Ask for it again.',
      );
    }
    return JSON.parse(raw) as RenderStatus;
  }

  async collect(id: string): Promise<Buffer> {
    const raw = await this.redis.get(RenderQueue.resultKey(id));
    if (!raw) {
      throw new NotFoundException(
        'That download is no longer available. Ask for it again.',
      );
    }
    return Buffer.from(raw, 'base64');
  }
}
