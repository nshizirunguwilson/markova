import { NotFoundException } from '@nestjs/common';

import { RENDER_QUEUE, RenderJob } from './jobs.constants';
import { RenderQueue } from './render.queue';

/**
 * Accepting a render and reporting on it.
 *
 * The point of the queue is that the request ends before the work does. One
 * report card starts a headless Chrome page and costs hundreds of milliseconds
 * of a server slot; a class of thirty at the end of term is thirty of those,
 * and that is the moment a school actually loads this system.
 *
 * So the contract these hold is: accepting work is cheap, the caller gets an
 * id straight away, and the bytes are parked somewhere that expires rather
 * than kept in the queue's own bookkeeping.
 */
describe('the render queue', () => {
  const queue = { add: jest.fn() };
  const redis = { set: jest.fn(), get: jest.fn() };
  const renders = new RenderQueue(queue as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
    queue.add.mockResolvedValue({ id: 42 });
  });

  it('returns an id the moment the work is accepted', async () => {
    const id = await renders.enqueue(
      RenderJob.TERM_REPORT,
      { studentId: 's-1', termId: 't-1' },
      'user-1',
    );
    expect(id).toBe('42');
    expect(queue.add).toHaveBeenCalledWith(
      RenderJob.TERM_REPORT,
      expect.objectContaining({ studentId: 's-1', requestedBy: 'user-1' }),
      expect.anything(),
    );
  });

  it('records who asked, so a worker can be audited later', async () => {
    await renders.enqueue(RenderJob.DOCUMENT, { studentId: 's-1' }, 'user-9');
    expect(queue.add.mock.calls[0][1].requestedBy).toBe('user-9');
  });

  it('marks it queued straight away, so a poll never finds nothing', async () => {
    await renders.enqueue(RenderJob.TERM_REPORT, {}, 'user-1');
    const [key, value] = redis.set.mock.calls[0];
    expect(key).toBe('render:status:42');
    expect(JSON.parse(value)).toMatchObject({ state: 'queued', progress: 0 });
  });

  /*
    Finished bytes go to Redis under their own key rather than back through the
    job's return value. A job result is kept in the job record, and a class
    pack is several megabytes: thirty of those in the queue's bookkeeping makes
    the queue slow for everything else.
  */
  it('parks the result outside the job record, with an expiry', async () => {
    await renders.store('42', Buffer.from('%PDF-1.4'));
    const [key, , mode, ttl] = redis.set.mock.calls[0];
    expect(key).toBe('render:result:42');
    expect(mode).toBe('EX');
    expect(ttl).toBeGreaterThan(0);
  });

  it('gives the bytes back exactly as they went in', async () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0x7f]);
    redis.get.mockResolvedValue(pdf.toString('base64'));
    expect(await renders.collect('42')).toEqual(pdf);
  });

  it('does not let the queue grow without bound', async () => {
    await renders.enqueue(RenderJob.TERM_REPORT, {}, 'user-1');
    expect(queue.add.mock.calls[0][2]).toMatchObject({ removeOnComplete: true });
  });

  /* A failure is a support question, and the reason has to outlive the job
     record long enough for somebody to ask about it. */
  it('keeps failures around for a while', async () => {
    await renders.enqueue(RenderJob.TERM_REPORT, {}, 'user-1');
    expect(queue.add.mock.calls[0][2].removeOnFail).toMatchObject({
      age: expect.any(Number),
    });
  });

  it('retries a render that failed once', async () => {
    await renders.enqueue(RenderJob.TERM_REPORT, {}, 'user-1');
    expect(queue.add.mock.calls[0][2].attempts).toBeGreaterThan(1);
  });

  describe('asking about one that is gone', () => {
    /*
      Expired and never existed are the same answer to the caller, and they do
      not need to tell the difference: both mean ask for it again. Saying
      "expired" would also be a way to probe which ids have existed.
    */
    it('says the download is gone rather than throwing something raw', async () => {
      redis.get.mockResolvedValue(null);
      await expect(renders.status('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(renders.collect('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('uses one queue, so there is one place to watch', () => {
    expect(RENDER_QUEUE).toBe('render');
  });
});
