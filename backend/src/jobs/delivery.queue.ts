import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  DELIVERY_ATTEMPTS,
  DELIVERY_BACKOFF_MS,
  DELIVERY_QUEUE,
  DeliveryJob,
} from './jobs.constants';

/** What an email needs to be sent. */
export interface EmailJob {
  to: string;
  name?: string;
  subject: string;
  body: string;
  /** Marks the message as one somebody is waiting on right now. */
  urgent?: boolean;
}

export interface SmsJob {
  phone: string;
  message: string;
  urgent?: boolean;
}

/**
 * Outbound messages, queued rather than sent inline.
 *
 * The problem this solves is narrow and serious: staff sign-in requires an
 * OTP, and the code was sent inside the request. A momentary SMTP failure
 * dropped it, the member of staff never received it, and nothing anywhere
 * recorded that it had happened. From the outside it looked like the password
 * was wrong.
 *
 * Queued, that becomes six attempts over about fifteen minutes, and a failure
 * that is written down. Queueing also takes the provider's latency out of the
 * request: sign-in no longer waits for somebody else's mail server.
 */
@Injectable()
export class DeliveryQueue {
  private readonly logger = new Logger(DeliveryQueue.name);

  constructor(@InjectQueue(DELIVERY_QUEUE) private readonly queue: Queue) {}

  async email(job: EmailJob): Promise<void> {
    await this.add(DeliveryJob.EMAIL, job, job.urgent);
  }

  async sms(job: SmsJob): Promise<void> {
    await this.add(DeliveryJob.SMS, job, job.urgent);
  }

  /**
   * Put a message on the queue.
   *
   * Never throws. A caller sending a notification must not fail because the
   * queue is unreachable: the thing they were actually doing, taking a
   * register or issuing a card, has already succeeded, and undoing it because
   * an email could not be enqueued would be the wrong trade.
   */
  private async add(
    name: string,
    data: EmailJob | SmsJob,
    urgent?: boolean,
  ): Promise<void> {
    try {
      await this.queue.add(name, data, {
        attempts: DELIVERY_ATTEMPTS,
        backoff: { type: 'exponential', delay: DELIVERY_BACKOFF_MS },
        /* A sign-in code goes in front of a fees reminder. Somebody is
           watching a screen for one of them and not for the other. */
        priority: urgent ? 1 : 10,
        removeOnComplete: true,
        /* Failures are kept for a day. "The code never arrived" is a support
           question, and the answer has to still be there when it is asked. */
        removeOnFail: { age: 86_400 },
      });
    } catch (error) {
      this.logger.error(
        `Could not queue ${name}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
