import { DELIVERY_ATTEMPTS, DeliveryJob } from './jobs.constants';
import { DeliveryProcessor } from './delivery.processor';
import { currentRequest } from '../prisma/request-context';

/**
 * Sending the messages, with real retries and a failure that is written down.
 *
 * The line between "still trying" and "nobody got it" is the whole point: a
 * provider having a bad minute must not read the same as a message that was
 * never delivered, or somebody chasing "the code never arrived" cannot tell
 * which they are looking at.
 */
describe('the delivery worker', () => {
  const notifications = {
    sendEmailToAddress: jest.fn(),
    sendSMSToPhone: jest.fn(),
  };
  const worker = new DeliveryProcessor(notifications as never);

  const job = (name: string, data: Record<string, unknown>, attemptsMade = 0) =>
    ({ name, data, attemptsMade }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    notifications.sendEmailToAddress.mockResolvedValue(undefined);
    notifications.sendSMSToPhone.mockResolvedValue(undefined);
  });

  /* Inside the school that queued it, so the message is signed by it. */
  it('sends inside the school that queued it', async () => {
    let seen: string | undefined;
    notifications.sendSMSToPhone.mockImplementation(() => {
      seen = currentRequest()?.schoolId;
      return Promise.resolve();
    });
    await worker.process(
      job(DeliveryJob.SMS, {
        phone: '+250788000001',
        message: 'Overdue',
        schoolId: 'school-2',
      }),
    );
    expect(seen).toBe('school-2');
  });

  it('sends outside any school a message that had none', async () => {
    let seen: unknown = 'unset';
    notifications.sendSMSToPhone.mockImplementation(() => {
      seen = currentRequest();
      return Promise.resolve();
    });
    await worker.process(
      job(DeliveryJob.SMS, { phone: '+250788000001', message: 'Code 1' }),
    );
    expect(seen).toBeNull();
  });

  it('sends an email', async () => {
    await worker.process(
      job(DeliveryJob.EMAIL, {
        to: 'a@b.com',
        name: 'Aline',
        subject: 'Hello',
        body: '<p>Hi</p>',
      }),
    );
    expect(notifications.sendEmailToAddress).toHaveBeenCalledWith(
      'a@b.com',
      'Aline',
      'Hello',
      '<p>Hi</p>',
    );
  });

  it('sends an SMS', async () => {
    await worker.process(
      job(DeliveryJob.SMS, { phone: '+250788000001', message: 'Code: 123456' }),
    );
    expect(notifications.sendSMSToPhone).toHaveBeenCalledWith(
      '+250788000001',
      'Code: 123456',
    );
  });

  it('copes with an email that carries no name', async () => {
    await worker.process(
      job(DeliveryJob.EMAIL, { to: 'a@b.com', subject: 'x', body: 'y' }),
    );
    expect(notifications.sendEmailToAddress).toHaveBeenCalledWith(
      'a@b.com',
      '',
      'x',
      'y',
    );
  });

  describe('when the provider fails', () => {
    beforeEach(() =>
      notifications.sendEmailToAddress.mockRejectedValue(
        new Error('SMTP timeout'),
      ),
    );

    /* Rethrown, so BullMQ retries it. Swallowing would mark the job complete
       with nothing delivered, which is the silent failure this replaced. */
    it('rethrows so the queue tries again', async () => {
      await expect(
        worker.process(
          job(DeliveryJob.EMAIL, { to: 'a@b.com', subject: 'x', body: 'y' }),
        ),
      ).rejects.toThrow('SMTP timeout');
    });

    /* An early failure is a provider having a bad minute. Logging it at error
       would make every hiccup look like a lost message. */
    it('warns on an attempt that will be retried', async () => {
      const warn = jest
        .spyOn(
          (worker as never as { logger: { warn: jest.Mock } }).logger,
          'warn',
        )
        .mockImplementation();
      await expect(
        worker.process(
          job(DeliveryJob.EMAIL, { to: 'a@b.com', subject: 'x', body: 'y' }, 0),
        ),
      ).rejects.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('will retry'));
    });

    /* Only the last one means nobody received anything, and that is the line
       somebody greps for when a member of staff cannot sign in. */
    it('errors only once it has given up', async () => {
      const error = jest
        .spyOn(
          (worker as never as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation();
      await expect(
        worker.process(
          job(
            DeliveryJob.EMAIL,
            { to: 'a@b.com', subject: 'x', body: 'y' },
            DELIVERY_ATTEMPTS - 1,
          ),
        ),
      ).rejects.toThrow();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('gave up'));
    });

    /*
      The address, never the body. These messages carry one-time codes, and a
      clinic notice carries a child's medical detail. An address is enough to
      chase a delivery and is already in the mail server's own logs.
    */
    it('never writes the message body into the log', async () => {
      const error = jest
        .spyOn(
          (worker as never as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation();
      await expect(
        worker.process(
          job(
            DeliveryJob.EMAIL,
            { to: 'a@b.com', subject: 'x', body: 'the code is 519272' },
            DELIVERY_ATTEMPTS - 1,
          ),
        ),
      ).rejects.toThrow();
      expect(error.mock.calls[0][0]).not.toContain('519272');
      expect(error.mock.calls[0][0]).toContain('a@b.com');
    });
  });

  it('refuses work it does not recognise rather than dropping it', async () => {
    await expect(worker.process(job('carrier-pigeon', {}))).rejects.toThrow(
      /Unknown delivery job/,
    );
  });
});
