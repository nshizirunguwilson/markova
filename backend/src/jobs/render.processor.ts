import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { withSchool } from '../prisma/request-context';

import { ReportsService } from '../modules/reports/reports.service';
import { RENDER_CONCURRENCY, RENDER_QUEUE, RenderJob } from './jobs.constants';
import { RenderQueue } from './render.queue';

/**
 * Where the rendering actually happens, off the request thread.
 *
 * Concurrency is capped rather than left open. Each job in flight is a Chrome
 * page with its own compositor, and memory runs out before CPU does: past a
 * handful the box swaps and every render slows down, including the ones
 * already running. Two per worker, lifted by RENDER_CONCURRENCY when a
 * deployment has the memory for it.
 *
 * This class is only registered in a process that runs as a worker, so the API
 * instances never start a browser at all. See jobs.module.ts.
 */
@Processor(RENDER_QUEUE, { concurrency: RENDER_CONCURRENCY })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly queue: RenderQueue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const id = String(job.id);
    const started = Date.now();
    await this.queue.write(id, { id, state: 'working', progress: 0 });

    try {
      /* The worker has nobody signed in, so the job carries its school, and
         the render runs inside it. A job without one is refused rather than
         run above the wall between schools. */
      const schoolId = (job.data as { schoolId?: string }).schoolId;
      if (!schoolId) throw new Error('This render has no school.');
      const { buffer, filename } = await withSchool(schoolId, () =>
        this.render(job),
      );
      await this.queue.store(id, buffer);
      await this.queue.write(id, {
        id,
        state: 'done',
        progress: 100,
        filename,
      });
      this.logger.log(
        `${job.name} ${id} rendered in ${Date.now() - started}ms, ${Math.round(buffer.length / 1024)}KB`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The render failed';
      /* The reason is kept where the client can read it, not only in the log.
         "It did not work" with no reason is a support call. */
      await this.queue.write(id, {
        id,
        state: 'failed',
        progress: 0,
        error: message,
      });
      this.logger.error(`${job.name} ${id} failed: ${message}`);
      throw error;
    }
  }

  private async render(
    job: Job,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const d = job.data as Record<string, string>;

    switch (job.name) {
      case RenderJob.TERM_REPORT:
        return {
          buffer: await this.reports.generateTermReportPdf(
            d.studentId,
            d.termId,
          ),
          filename: `report-card-${d.studentId}.pdf`,
        };

      case RenderJob.YEAR_REPORT:
        return {
          buffer: await this.reports.generateYearReportPdf(
            d.studentId,
            d.academicYearId,
          ),
          filename: `year-report-${d.studentId}.pdf`,
        };

      case RenderJob.DOCUMENT: {
        const out = await this.reports.generateDocumentPdf(d.studentId, d.type);
        return { buffer: out.pdf, filename: `${out.title}.pdf` };
      }

      default:
        throw new Error(`Unknown render job: ${job.name}`);
    }
  }
}
