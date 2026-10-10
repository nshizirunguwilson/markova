import { ConfigService } from '@nestjs/config';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

const existsSync = jest.fn();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: (...args: unknown[]) => existsSync(...args) };
});

import { NotificationsService } from './notifications.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The logo on an outgoing email.
 *
 * Gmail strips `data:` URIs, so the mark is sent as an embedded attachment
 * instead. On a deployment where the bundled asset is not on disk - a trimmed
 * container image, or a volume mounted over `assets` - the header falls back
 * to the school's name in plain text rather than a broken image.
 */
describe('the header on an email the school sends', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;

  const build = () => {
    const config = {
      get: (key: string) =>
        ({
          SMTP_HOST: 'smtp.markova.edu',
          SMTP_FROM_NAME: 'Markova School',
        })[key],
    } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    service.onModuleInit();
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({});
    build();
  });

  const sendOne = (firstName: string | null = 'Aline') => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'a.uwase@markova.edu',
      firstName,
    });
    return service.send({
      userId: 'user-1',
      title: 'Marks published',
      message: 'Term 1 is out',
      type: 'EMAIL',
    } as never);
  };

  it('embeds the mark when the asset is on disk', async () => {
    existsSync.mockReturnValue(true);

    await sendOne();

    const mail = sendMail.mock.calls[0][0];
    expect(mail.attachments).toHaveLength(1);
    expect(mail.html).toMatch(/src="cid:/);
  });

  it('falls back to the school name when it is not', async () => {
    existsSync.mockReturnValue(false);

    await sendOne();

    const mail = sendMail.mock.calls[0][0];
    expect(mail.attachments).toEqual([]);
    expect(mail.html).toMatch(/<h1[^>]*>Markova School<\/h1>/);
    expect(mail.html).not.toMatch(/src="cid:/);
  });

  it('greets somebody with no first name on file politely', async () => {
    existsSync.mockReturnValue(true);

    await sendOne(null);

    expect(sendMail.mock.calls[0][0].html).toMatch(/Dear User,/);
  });

  it('greets somebody by name when there is one', async () => {
    existsSync.mockReturnValue(true);

    await sendOne('Aline');

    expect(sendMail.mock.calls[0][0].html).toMatch(/Dear Aline,/);
  });
});

/**
 * A school with no email account set up at all.
 *
 * Most of them, on day one. The in-app notification is the fallback and it
 * always exists, so nothing may throw on the way past a missing transporter.
 */
describe('sending email from a school with no SMTP account', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    existsSync.mockReturnValue(true);
    const config = { get: () => undefined } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    service.onModuleInit();
  });

  it('still writes the notification a person will see in the app', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'a.uwase@markova.edu',
      firstName: 'Aline',
    });

    const result = await service.send({
      userId: 'user-1',
      title: 'Marks published',
      message: 'Term 1 is out',
      type: 'EMAIL',
    } as never);

    expect(result).toEqual({ id: 'n-1' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('still writes them for a whole year group at once', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', email: 'a@markova.edu', firstName: 'Aline' },
    ]);

    const result = await service.sendBulk({
      userIds: ['u-1'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'EMAIL',
    } as never);

    expect(result).toEqual({ count: 1 });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

/**
 * A broadcast sent by SMS rather than email.
 *
 * SMS costs money per message, so a school sends one to a year group rather
 * than to everybody, and one number failing must not stop the rest.
 */
describe('a broadcast by SMS', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;
  let logged: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    existsSync.mockReturnValue(true);
    const config = { get: () => undefined } as unknown as ConfigService;
    prisma = createMockPrisma();
    service = new NotificationsService(prisma, config);
    prisma.notification.createMany.mockResolvedValue({ count: 2 });
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    logged = jest.spyOn((service as any).logger, 'error').mockImplementation();
    service.onModuleInit();
  });

  it('writes one notification per person', async () => {
    prisma.user.findUnique.mockResolvedValue({ phone: '+250788100000' });

    const result = await service.sendBulk({
      userIds: ['u-1', 'u-2'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'SMS',
    } as never);

    expect(result).toEqual({ count: 2 });
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });

  it('counts the numbers that failed without stopping the rest', async () => {
    prisma.user.findUnique
      .mockRejectedValueOnce(new Error('lookup failed'))
      .mockResolvedValue({ phone: '+250788100000' });

    await service.sendBulk({
      userIds: ['u-1', 'u-2'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'SMS',
    } as never);

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send 1/2'),
    );
  });

  it('says nothing when every number took it', async () => {
    prisma.user.findUnique.mockResolvedValue({ phone: '+250788100000' });

    await service.sendBulk({
      userIds: ['u-1'],
      title: 'School closes early',
      message: 'Buses leave at midday',
      type: 'SMS',
    } as never);

    expect(logged).not.toHaveBeenCalled();
  });
});
