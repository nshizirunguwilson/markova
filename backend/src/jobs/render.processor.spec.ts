import { RenderJob } from './jobs.constants';
import { RenderProcessor } from './render.processor';
import { currentRequest } from '../prisma/request-context';

/**
 * The worker, and what it does when a render goes wrong.
 *
 * This runs in a process that serves nobody, which is the whole point: an API
 * instance never launches a browser, so a class of report cards cannot make
 * the dashboard slow for the people using it.
 */
describe('the render worker', () => {
  const reports = {
    generateTermReportPdf: jest.fn(),
    generateYearReportPdf: jest.fn(),
    generateDocumentPdf: jest.fn(),
  };
  const queue = { write: jest.fn(), store: jest.fn() };
  const worker = new RenderProcessor(reports as never, queue as never);

  // Every job carries the school it was asked for in.
  const job = (name: string, data: Record<string, string> = {}) =>
    ({
      id: 7,
      name,
      data: { schoolId: 'school-1', ...data },
      updateProgress: jest.fn(),
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    reports.generateTermReportPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
    reports.generateYearReportPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
    reports.generateDocumentPdf.mockResolvedValue({
      pdf: Buffer.from('%PDF-1.4'),
      title: 'Transfer Letter',
    });
  });

  it('renders a term report and parks it', async () => {
    await worker.process(
      job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
    );
    expect(reports.generateTermReportPdf).toHaveBeenCalledWith('s-1', 't-1');
    expect(queue.store).toHaveBeenCalledWith('7', expect.any(Buffer));
  });

  /* The worker has nobody signed in. The school comes from the job. */
  it('renders inside the school the job belongs to', async () => {
    let schoolSeen: string | undefined;
    reports.generateTermReportPdf.mockImplementation(() => {
      schoolSeen = currentRequest()?.schoolId;
      return Promise.resolve(Buffer.from('%PDF-1.4'));
    });
    await worker.process(
      job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
    );
    expect(schoolSeen).toBe('school-1');
  });

  it('refuses a job that does not say its school', async () => {
    const orphan = {
      id: 8,
      name: RenderJob.TERM_REPORT,
      data: { studentId: 's-1', termId: 't-1' },
      updateProgress: jest.fn(),
    } as never;
    await expect(worker.process(orphan)).rejects.toThrow(/no school/);
    expect(reports.generateTermReportPdf).not.toHaveBeenCalled();
  });

  it('renders a year report', async () => {
    await worker.process(
      job(RenderJob.YEAR_REPORT, { studentId: 's-1', academicYearId: 'y-1' }),
    );
    expect(reports.generateYearReportPdf).toHaveBeenCalledWith('s-1', 'y-1');
  });

  it('names a document after the document, not after the id', async () => {
    await worker.process(
      job(RenderJob.DOCUMENT, { studentId: 's-1', type: 'transfer_letter' }),
    );
    const done = queue.write.mock.calls.at(-1)![1];
    expect(done.filename).toBe('Transfer Letter.pdf');
  });

  it('says it is working before it starts, and done after', async () => {
    await worker.process(
      job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
    );
    const states = queue.write.mock.calls.map((c) => c[1].state);
    expect(states[0]).toBe('working');
    expect(states.at(-1)).toBe('done');
  });

  it('finishes at a hundred, so a progress bar can reach the end', async () => {
    await worker.process(
      job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
    );
    expect(queue.write.mock.calls.at(-1)![1].progress).toBe(100);
  });

  /*
    A failure is written where the client can read it, not only into the log.
    "It did not work" with no reason is a support call, and the person who can
    answer it is not the person looking at the screen.
  */
  describe('when a render fails', () => {
    beforeEach(() => {
      reports.generateTermReportPdf.mockRejectedValue(
        new Error('Chrome would not start'),
      );
    });

    it('tells the client why', async () => {
      await expect(
        worker.process(
          job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
        ),
      ).rejects.toThrow();
      const last = queue.write.mock.calls.at(-1)![1];
      expect(last.state).toBe('failed');
      expect(last.error).toContain('Chrome would not start');
    });

    /* And rethrows, so BullMQ retries it rather than counting a failure as
       done. Swallowing it would leave the job marked complete with nothing to
       collect. */
    it('rethrows so the queue can retry it', async () => {
      await expect(
        worker.process(
          job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
        ),
      ).rejects.toThrow('Chrome would not start');
    });

    it('never parks a result for a job that failed', async () => {
      await expect(
        worker.process(
          job(RenderJob.TERM_REPORT, { studentId: 's-1', termId: 't-1' }),
        ),
      ).rejects.toThrow();
      expect(queue.store).not.toHaveBeenCalled();
    });
  });

  it('refuses work it does not recognise rather than hanging', async () => {
    await expect(worker.process(job('something-else'))).rejects.toThrow(
      /Unknown render job/,
    );
  });
});
