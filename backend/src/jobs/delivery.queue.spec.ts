import { DELIVERY_ATTEMPTS, DeliveryJob } from './jobs.constants';
import { DeliveryQueue } from './delivery.queue';

/**
 * Outbound messages, queued rather than sent inline.
 *
 * The problem this solves is narrow and serious: staff sign-in requires an
 * OTP, and the code used to be sent inside the login request. A momentary SMTP
 * failure dropped it, the member of staff never received it, and nothing
 * recorded that it had happened. From their side it looked like their password
 * was wrong.
 */
describe('queueing a message', () => {
  const queue = { add: jest.fn() };
  const delivery = new DeliveryQueue(queue as never);

  beforeEach(() => {
    jest.clearAllMocks();
    queue.add.mockResolvedValue({ id: '1' });
  });

  it('queues an email rather than sending it', async () => {
    await delivery.email({
      to: 'a@b.com',
      subject: 'Hello',
      body: '<p>Hi</p>',
    });
    expect(queue.add).toHaveBeenCalledWith(
      DeliveryJob.EMAIL,
      expect.objectContaining({ to: 'a@b.com', subject: 'Hello' }),
      expect.anything(),
    );
  });

  it('queues an SMS the same way', async () => {
    await delivery.sms({ phone: '+250788000001', message: 'Code: 123456' });
    expect(queue.add).toHaveBeenCalledWith(
      DeliveryJob.SMS,
      expect.objectContaining({ phone: '+250788000001' }),
      expect.anything(),
    );
  });

  /*
    Six attempts on an exponential backoff from thirty seconds reaches about
    fifteen minutes. Chosen against the thing being delivered: a sign-in code
    has expired by then anyway, so trying longer would deliver something
    already useless.
  */
  it('tries hard enough to survive a provider having a bad minute', async () => {
    await delivery.email({ to: 'a@b.com', subject: 'x', body: 'y' });
    const options = queue.add.mock.calls[0][2];
    expect(options.attempts).toBe(DELIVERY_ATTEMPTS);
    expect(options.backoff).toMatchObject({ type: 'exponential' });
    expect(options.backoff.delay).toBeGreaterThanOrEqual(30_000);
  });

  /* A sign-in code goes ahead of a fees reminder, because somebody is watching
     a screen for one of them and not for the other. */
  it('puts an urgent message in front of an ordinary one', async () => {
    await delivery.email({
      to: 'a@b.com',
      subject: 'x',
      body: 'y',
      urgent: true,
    });
    await delivery.email({ to: 'c@d.com', subject: 'x', body: 'y' });
    const [urgent, ordinary] = queue.add.mock.calls.map((c) => c[2].priority);
    expect(urgent).toBeLessThan(ordinary);
  });

  /* "The code never arrived" is a support question, and the answer has to
     still be there when somebody asks it. */
  it('keeps a failure around long enough to be asked about', async () => {
    await delivery.email({ to: 'a@b.com', subject: 'x', body: 'y' });
    expect(queue.add.mock.calls[0][2].removeOnFail).toMatchObject({
      age: expect.any(Number),
    });
  });

  it('does not keep the ones that worked', async () => {
    await delivery.email({ to: 'a@b.com', subject: 'x', body: 'y' });
    expect(queue.add.mock.calls[0][2].removeOnComplete).toBe(true);
  });

  /*
    Never throws. The caller has already done the thing that mattered: taken a
    register, issued a card, accepted a sign-in. Failing that because a
    notification could not be enqueued would be the wrong trade entirely.
  */
  describe('when the queue itself is unreachable', () => {
    beforeEach(() => queue.add.mockRejectedValue(new Error('redis is down')));

    it('does not fail the thing the caller was actually doing', async () => {
      await expect(
        delivery.email({ to: 'a@b.com', subject: 'x', body: 'y' }),
      ).resolves.toBeUndefined();
      await expect(
        delivery.sms({ phone: '+250788000001', message: 'x' }),
      ).resolves.toBeUndefined();
    });
  });
});
