import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ReportsModule } from '../modules/reports/reports.module';
import { RENDER_QUEUE } from './jobs.constants';
import { RenderProcessor } from './render.processor';
import { RenderQueue } from './render.queue';

/**
 * The background work, and which processes do it.
 *
 * Every process can put work on the queue. Only a process started with
 * `WORKER=1` takes work off it, and that is the whole point of the split: the
 * API instances never launch a browser, so a run of report cards cannot make
 * the dashboard slow. Scale the two independently, which is what the compose
 * file does.
 *
 * Run the same image both ways:
 *
 *   npm run start:prod              an API instance
 *   WORKER=1 npm run start:prod     a worker
 */
const isWorker = process.env.WORKER === '1';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL') || 'redis://localhost:6379',
          /* BullMQ needs this off: it blocks on the queue, and a retry policy
             that gives up would drop a worker off the queue silently. */
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: RENDER_QUEUE }),
    forwardRef(() => ReportsModule),
  ],
  providers: [RenderQueue, ...(isWorker ? [RenderProcessor] : [])],
  exports: [RenderQueue],
})
export class JobsModule {}
