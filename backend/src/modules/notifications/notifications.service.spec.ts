import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

const sendMail = jest.fn();
const createTransport = jest.fn((..._args: unknown[]) => ({ sendMail }));
jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => createTransport(...args),
}));

const twilioCreate = jest.fn();
jest.mock('twilio', () => ({
  Twilio: jest.fn().mockImplementation(() => ({
    messages: { create: (...args: unknown[]) => twilioCreate(...args) },
  })),
}));

/**
 * Reaching people.
 *
 * The in-app row is the record that a person was told; the SMS, email or push
 * is the attempt to reach them. That distinction is the whole design: an
 * unreachable phone must never lose the record, and a school with no SMS
 * account configured must still be able to run.
 */
describe('NotificationsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;
  let env: Record<string, string | undefined>;

  const build = (overrides: Record<string, string | undefined> = {}) => {
    env = { ...overrides };
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    prisma.notification.createMany.mockResolvedValue({ count: 0 });
    prisma.notification.update.mockResolvedValue({});
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.pushToken.findMany.mockResolvedValue([]);
    prisma.pushToken.upsert.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({});
    twilioCreate.mockResolvedValue({});
    build();
  });

  /**
   * A school without an SMTP host or a Twilio account still has to work. The
   * in-app list is the fallback, and it always exists.
   */
  describe('starting up', () => {
    it('runs with no email account configured', () => {
      build();
      service.onModuleInit();
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('configures email when a host is given', () => {
      build({ SMTP_HOST: 'smtp.brevo.com', SMTP_PORT: '2525' });
      service.onModuleInit();
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'smtp.brevo.com', port: 2525 }),
      );
    });

    it('falls back to the standard port when none is given', () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      expect(createTransport.mock.calls[0][0]).toMatchObject({ port: 587 });
    });

    it('runs with no SMS account configured', () => {
      build();
      service.onModuleInit();
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('configures SMS when both credentials are given', () => {
      build({ TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tok' });
      service.onModuleInit();
      expect((service as any).twilioSenderId).toBe('Markova');
    });

    it('uses the sender name the school chose', () => {
      build({
        TWILIO_SID: 'AC1',
        TWILIO_TOKEN: 'tok',
        TWILIO_SENDER_ID: 'MarkovaTSS',
      });
      service.onModuleInit();
      expect((service as any).twilioSenderId).toBe('MarkovaTSS');
    });

    it('does not configure SMS on half the credentials', () => {
      build({ TWILIO_SID: 'AC1' });
      service.onModuleInit();
      expect((service as any).twilioClient).toBeNull();
    });
  });

  /**
   * The record first, the attempt second. A gateway that is down must never
   * mean the school has no evidence it told somebody.
   */
  describe('sending one notification', () => {
    it('writes the in-app record whatever happens next', async () => {
      const result = await service.send({
        userId: 'user-1',
        title: 'Report card published',
        message: 'Term 3 is ready',
        type: 'EMAIL',
      } as never);
      expect(prisma.notification.create).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'n-1' });
    });

    it('keeps the record when the gateway refuses', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({
        email: 'a@markova.edu',
        firstName: 'Aline',
      });
      sendMail.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.send({
          userId: 'user-1',
          title: 'X',
          message: 'Y',
          type: 'EMAIL',
        } as never),
      ).resolves.toMatchObject({ id: 'n-1' });
    });

    it('says so in the log rather than silently', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      const error = jest.spyOn((service as any).logger, 'error');
      prisma.user.findUnique.mockResolvedValue({ email: 'a@markova.edu' });
      sendMail.mockRejectedValue(new Error('boom'));

      await service.send({
        userId: 'user-1',
        title: 'X',
        message: 'Y',
        type: 'EMAIL',
      } as never);
      expect(error).toHaveBeenCalledWith(
        'Failed to send EMAIL notification',
        expect.any(String),
      );
    });

    it('sends nothing to a person with no phone on record', async () => {
      build({ TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tok' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({ phone: null });
      await service.send({
        userId: 'user-1',
        title: 'X',
        message: 'Y',
        type: 'SMS',
      } as never);
      expect(twilioCreate).not.toHaveBeenCalled();
    });

    it('sends an SMS to a person who has a phone', async () => {
      build({ TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tok' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({ phone: '+250788100000' });
      await service.send({
        userId: 'user-1',
        title: 'X',
        message: 'Buses leave at midday',
        type: 'SMS',
      } as never);
      expect(twilioCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+250788100000',
          body: 'Buses leave at midday',
        }),
      );
    });

    // A school running without an SMS account should see what would have been
    // sent, not a crash.
    it('logs what it would have sent when SMS is not configured', async () => {
      const log = jest.spyOn((service as any).logger, 'log');
      await service.sendSMSToPhone('+250788100000', 'Hello');
      expect(log.mock.calls[0][0]).toContain('Twilio not configured');
      expect(twilioCreate).not.toHaveBeenCalled();
    });

    it('keeps going when the SMS gateway fails', async () => {
      build({ TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tok' });
      service.onModuleInit();
      twilioCreate.mockRejectedValue(new Error('rejected by carrier'));
      await expect(
        service.sendSMSToPhone('+250788100000', 'Hello'),
      ).resolves.toBeUndefined();
    });

    it('sends nothing to a person with no email on record', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({ email: null });
      await service.send({
        userId: 'user-1',
        title: 'X',
        message: 'Y',
        type: 'EMAIL',
      } as never);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('addresses the email to the person by name', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com', SMTP_FROM_NAME: 'Markova TSS' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({
        email: 'c@markova.edu',
        firstName: 'Claudine',
      });
      await service.send({
        userId: 'user-1',
        title: 'Report card published',
        message: 'Term 3 is ready',
        type: 'EMAIL',
      } as never);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe('c@markova.edu');
      expect(mail.subject).toBe('Report card published');
      expect(mail.html).toContain('Dear Claudine');
      expect(mail.from).toContain('Markova TSS');
    });

    it('addresses somebody whose name is missing without leaving a gap', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({
        email: 'x@markova.edu',
        firstName: null,
      });
      await service.send({
        userId: 'user-1',
        title: 'X',
        message: 'Y',
        type: 'EMAIL',
      } as never);
      expect(sendMail.mock.calls[0][0].html).toContain('Dear User');
    });

    it('says so and sends nothing when SMTP is not configured', async () => {
      const log = jest.spyOn((service as any).logger, 'log');
      await service.sendEmailToAddress('a@x.rw', 'A', 'Subject', 'Body');
      expect(log.mock.calls[0][0]).toContain('SMTP not configured');
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('keeps going when a direct email fails', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      sendMail.mockRejectedValue(new Error('bounced'));
      await expect(
        service.sendEmailToAddress('a@x.rw', 'A', 'S', 'B'),
      ).resolves.toBeUndefined();
    });
  });

  /**
   * Sending to four hundred families. The in-app rows go in one write rather
   * than four hundred, and one bad address must not stop the other 399.
   */
  describe('sending to many at once', () => {
    it('writes every in-app record in one go', async () => {
      await service.sendBulk({
        userIds: ['u-1', 'u-2', 'u-3'],
        title: 'X',
        message: 'Y',
        type: 'PUSH',
      } as never);
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.notification.createMany.mock.calls[0][0].data).toHaveLength(
        3,
      );
    });

    it('reports how many it addressed', async () => {
      const result = await service.sendBulk({
        userIds: ['u-1', 'u-2'],
        title: 'X',
        message: 'Y',
        type: 'PUSH',
      } as never);
      expect(result).toEqual({ count: 2 });
    });

    it('reads every address in one query rather than one each', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      prisma.user.findMany.mockResolvedValue([]);
      await service.sendBulk({
        userIds: ['u-1', 'u-2'],
        title: 'X',
        message: 'Y',
        type: 'EMAIL',
      } as never);
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });

    it('skips the people who have no email at all', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', email: 'a@x.rw', firstName: 'A' },
        { id: 'u-2', email: null, firstName: 'B' },
      ]);
      await service.sendBulk({
        userIds: ['u-1', 'u-2'],
        title: 'X',
        message: 'Y',
        type: 'EMAIL',
      } as never);
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    // One bad address in four hundred must not throw the rest away.
    it('keeps sending after one address fails', async () => {
      build({ SMTP_HOST: 'smtp.brevo.com' });
      service.onModuleInit();
      const error = jest.spyOn((service as any).logger, 'error');
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', email: 'a@x.rw', firstName: 'A' },
        { id: 'u-2', email: 'b@x.rw', firstName: 'B' },
      ]);
      sendMail
        .mockRejectedValueOnce(new Error('bounced'))
        .mockResolvedValue({});

      await expect(
        service.sendBulk({
          userIds: ['u-1', 'u-2'],
          title: 'X',
          message: 'Y',
          type: 'EMAIL',
        } as never),
      ).resolves.toEqual({ count: 2 });
      expect(error.mock.calls[0][0]).toContain('1/2');
    });

    it('keeps sending after one SMS fails', async () => {
      build({ TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tok' });
      service.onModuleInit();
      prisma.user.findUnique.mockResolvedValue({ phone: '+250788' });
      await expect(
        service.sendBulk({
          userIds: ['u-1', 'u-2'],
          title: 'X',
          message: 'Y',
          type: 'SMS',
        } as never),
      ).resolves.toEqual({ count: 2 });
    });
  });

  describe('the in-app list', () => {
    it('reads a person’s own alerts, newest first', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      await service.getUserNotifications('user-1');
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('counts only what is unread', async () => {
      prisma.notification.count.mockResolvedValue(4);
      const result = await service.getUnreadCount('user-1');
      expect(result).toEqual({ unreadCount: 4 });
      expect(prisma.notification.count.mock.calls[0][0].where).toEqual({
        userId: 'user-1',
        isRead: false,
      });
    });

    /**
     * Marking one read is scoped to its owner. Without that, anybody holding
     * an id could clear somebody else's alerts.
     */
    it('refuses to mark somebody else’s alert read', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      await expect(service.markAsRead('n-9', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('marks one of their own read', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });
      await service.markAsRead('n-1', 'user-1');
      expect(prisma.notification.update.mock.calls[0][0].data).toEqual({
        isRead: true,
      });
    });

    it('marks only their own unread ones read', async () => {
      await service.markAllAsRead('user-1');
      expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
        userId: 'user-1',
        isRead: false,
      });
    });
  });

  /**
   * Push tokens. A phone re-registers on every app start, and an uninstalled
   * app leaves a token that would otherwise be retried for ever.
   */
  describe('push', () => {
    it('re-registers the same token without failing', async () => {
      await service.registerPushToken('user-1', 'ExpoToken[abc]', 'ios');
      const call = prisma.pushToken.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ token: 'ExpoToken[abc]' });
      expect(call.update.userId).toBe('user-1');
    });

    it('sends nothing to a person with no device registered', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as never);
      await service.sendPushNotification('user-1', 'X', 'Y');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('sends to every device a person has', async () => {
      prisma.pushToken.findMany.mockResolvedValue([
        { token: 'ExpoToken[a]' },
        { token: 'ExpoToken[b]' },
      ]);
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        json: () => Promise.resolve({ data: [] }),
      } as never);

      await service.sendPushNotification('user-1', 'Title', 'Body');
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({ to: 'ExpoToken[a]', title: 'Title' });
      fetchSpy.mockRestore();
    });

    /**
     * An uninstalled app answers DeviceNotRegistered for ever. Dropping the
     * token is what stops the school paying to push into nothing.
     */
    it('drops a token whose app was uninstalled', async () => {
      prisma.pushToken.findMany.mockResolvedValue([
        { token: 'ExpoToken[gone]' },
        { token: 'ExpoToken[live]' },
      ]);
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        json: () =>
          Promise.resolve({
            data: [
              { details: { error: 'DeviceNotRegistered' } },
              { status: 'ok' },
            ],
          }),
      } as never);

      await service.sendPushNotification('user-1', 'X', 'Y');
      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ['ExpoToken[gone]'] } },
      });
      fetchSpy.mockRestore();
    });

    it('drops nothing when every device answered', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExpoToken[a]' }]);
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
      } as never);

      await service.sendPushNotification('user-1', 'X', 'Y');
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('keeps going when the push service cannot be reached', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExpoToken[a]' }]);
      const fetchSpy = jest
        .spyOn(global, 'fetch' as never)
        .mockRejectedValue(new Error('network down') as never);

      await expect(
        service.sendPushNotification('user-1', 'X', 'Y'),
      ).resolves.toBeUndefined();
      fetchSpy.mockRestore();
    });

    it('copes with a reply that is not the shape it expected', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExpoToken[a]' }]);
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        json: () => Promise.resolve({ errors: ['bad request'] }),
      } as never);

      await expect(
        service.sendPushNotification('user-1', 'X', 'Y'),
      ).resolves.toBeDefined();
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});

/**
 * A push notification with something attached to it.
 *
 * A "marks published" push carries the id of the term result, so tapping it
 * opens the right sheet rather than the home screen. Both parts are optional,
 * and a push with neither must not carry the word undefined into the payload.
 */
describe('what a push notification carries with it', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;

  const build = () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExpoToken[a]' }]);
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    build();
  });

  const sentPayload = (fetchSpy: jest.SpyInstance) =>
    JSON.parse((fetchSpy.mock.calls[0][1] as any).body)[0];

  it('carries what the notification points at', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    } as never);

    await service.send({
      userId: 'user-1',
      title: 'Marks published',
      message: 'Term 1 is out',
      type: 'PUSH',
      relatedEntityType: 'TERM_RESULT',
      relatedEntityId: 'res-1',
    } as never);

    expect(sentPayload(fetchSpy).data).toMatchObject({
      relatedEntityType: 'TERM_RESULT',
      relatedEntityId: 'res-1',
    });
    fetchSpy.mockRestore();
  });

  it('carries nothing extra when it points at nothing', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    } as never);

    await service.send({
      userId: 'user-1',
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'PUSH',
    } as never);

    expect(sentPayload(fetchSpy).data).toEqual({});
    fetchSpy.mockRestore();
  });

  // The notification row is the thing a person actually sees in the app, so a
  // channel that is down must not lose it.
  it('keeps the notification when the push itself fails', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockRejectedValue(new Error('expo is down') as never);

    const result = await service.send({
      userId: 'user-1',
      title: 'Marks published',
      message: 'Term 1 is out',
      type: 'PUSH',
    } as never);

    expect(result).toEqual({ id: 'n-1' });
    expect(prisma.notification.create).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps it even when the failure is not an Error at all', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockRejectedValue('expo is down' as never);

    const result = await service.send({
      userId: 'user-1',
      title: 'Marks published',
      message: 'Term 1 is out',
      type: 'PUSH',
    } as never);

    expect(result).toEqual({ id: 'n-1' });
    fetchSpy.mockRestore();
  });

  it('sends an access token to Expo when the school has one', async () => {
    const config = {
      get: (key: string) =>
        key === 'EXPO_ACCESS_TOKEN' ? 'expo-secret' : undefined,
    } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExpoToken[a]' }]);
    jest.spyOn((service as any).logger, 'error').mockImplementation();

    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    } as never);

    await service.sendPushNotification('user-1', 'Title', 'Body');

    const headers = (fetchSpy.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toBe('Bearer expo-secret');
    fetchSpy.mockRestore();
  });

  it('sends none when the school has no Expo account', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    } as never);

    await service.sendPushNotification('user-1', 'Title', 'Body');

    const headers = (fetchSpy.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toBeUndefined();
    fetchSpy.mockRestore();
  });
});

/**
 * Telling a whole year group at once.
 *
 * A broadcast reaches hundreds of families, and one address bouncing must not
 * stop the rest. The failures are counted and logged rather than thrown.
 */
describe('a broadcast where some of it fails', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;
  let logged: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: (key: string) =>
        ({
          SMTP_HOST: 'smtp.markova.edu',
          SMTP_USER: 'noreply@markova.edu',
          SMTP_PASS: 'secret',
        })[key],
    } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.notification.createMany.mockResolvedValue({ count: 2 });
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    // The transporter is built on module init, not in the constructor.
    service.onModuleInit();
    logged = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();
  });

  it('counts the addresses that bounced without failing the rest', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', email: 'a@markova.edu', firstName: 'Aline' },
      { id: 'u-2', email: 'b@markova.edu', firstName: null },
    ]);
    sendMail
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('mailbox full'));

    const result = await service.sendBulk({
      userIds: ['u-1', 'u-2'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'EMAIL',
    } as never);

    expect(result).toEqual({ count: 2 });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send 1/2'),
    );
  });

  it('greets a person with no first name on file politely', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-2', email: 'b@markova.edu', firstName: null },
    ]);
    sendMail.mockResolvedValue({});

    await service.sendBulk({
      userIds: ['u-2'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'EMAIL',
    } as never);

    expect(sendMail.mock.calls[0][0].html).toMatch(/Dear User,/);
  });

  it('says nothing when every address took it', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', email: 'a@markova.edu', firstName: 'Aline' },
    ]);
    sendMail.mockResolvedValue({});

    await service.sendBulk({
      userIds: ['u-1'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'EMAIL',
    } as never);

    expect(logged).not.toHaveBeenCalled();
  });
});
