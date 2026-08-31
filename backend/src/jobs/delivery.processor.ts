import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { NotificationsService } from '../modules/notifications/notifications.service';
import {
  DELIVERY_ATTEMPTS,
  DELIVERY_CONCURRENCY,
  DELIVERY_QUEUE,
  DeliveryJob,
} from './jobs.constants';
import type { EmailJob, SmsJob } from './delivery.queue';

/**
 * Sending the messages, off the request thread and with real retries.
 *
 * Only registered in a worker process, so an API instance never waits on
 * somebody else's mail server. That matters for sign-in in particular: the
 * OTP used to be sent inside the login request, which meant the request was
 * as slow as SMTP and as reliable.
 */
@Processor(DELIVERY_QUEUE, { concurrency: DELIVERY_CONCURRENCY })
export class DeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const attempt = job.attemptsMade + 1;

    try {
      if (job.name === DeliveryJob.EMAIL) {
        const { to, name, subject, body } = job.data as EmailJob;
        await this.notifications.sendEmailToAddress(to, name ?? '', subject, body);
      } else if (job.name === DeliveryJob.SMS) {
        const { phone, message } = job.data as SmsJob;
        await this.notifications.sendSMSToPhone(phone, message);
      } else {
        throw new Error(`Unknown delivery job: ${job.name}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';

      /*
        The last attempt is logged at error, the ones before it at warn.

        Without that distinction a provider having a bad minute looks exactly
        like a message that was never delivered, and somebody chasing "the code
        never arrived" cannot tell which they are looking at. Only the last line
        means nobody received anything.
      */
      if (attempt >= DELIVERY_ATTEMPTS) {
        this.logger.error(
          `${job.name} to ${this.recipient(job)} gave up after ${attempt} attempts: ${reason}`,
        );
      } else {
        this.logger.warn(
          `${job.name} to ${this.recipient(job)} failed on attempt ${attempt}, will retry: ${reason}`,
        );
      }
      throw error;
    }
  }

  /**
   * Who it was for, for the log line.
   *
   * An address is enough to chase a delivery and is already in the mail
   * server's own logs. The body never appears here: these messages carry
   * one-time codes and, for a clinic notice, a child's medical detail.
   */
  private recipient(job: Job): string {
    const data = job.data as Partial<EmailJob & SmsJob>;
    return data.to ?? data.phone ?? 'unknown';
  }
}
