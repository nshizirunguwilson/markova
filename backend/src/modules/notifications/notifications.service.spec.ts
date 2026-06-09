import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from './dto';
import * as nodemailer from 'nodemailer';

// Mock nodemailer so no real SMTP/Brevo connection is made. The mock transport
// records every sendMail call so we can assert the recipient and template used.
jest.mock('nodemailer');

describe('NotificationsService (email triggering)', () => {
  let service: NotificationsService;
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'mock' });

  const mockPrisma = {
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    pushToken: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const SMTP = {
    SMTP_HOST: 'smtp-relay.brevo.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    SMTP_FROM: 'noreply@markova.test',
    SMTP_FROM_NAME: 'Markova School',
  };
  const mockConfig = {
    get: jest.fn((k: string) => (SMTP as Record<string, string>)[k]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    // onModuleInit wires up the SMTP transport from config
    service.onModuleInit();
  });

  it('builds an SMTP transport from Brevo config on init', () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp-relay.brevo.com',
        port: 587,
        auth: { user: 'user', pass: 'pass' },
      }),
    );
  });

  it('sendEmailToAddress sends to the right recipient with subject + branded template', async () => {
    await service.sendEmailToAddress(
      'parent@example.com',
      'Mary',
      'Your Markova Verification Code',
      '<p>123456</p>',
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('parent@example.com');
    expect(arg.subject).toBe('Your Markova Verification Code');
    expect(arg.from).toContain('Markova School');
    expect(arg.html).toContain('Dear Mary'); // template personalisation
    expect(arg.html).toContain('123456'); // body injected
  });

  it('send(EMAIL) stores the in-app row AND dispatches an email to that user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'teacher@example.com',
      firstName: 'Aline',
    });

    await service.send({
      userId: 'user-1',
      title: 'Student Absence Alert',
      message: 'Jane was marked absent',
      type: NotificationType.EMAIL,
    });

    // DB row always created
    expect(mockPrisma.notification.create).toHaveBeenCalled();
    // Email dispatched to the resolved address
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('teacher@example.com');
    expect(sendMail.mock.calls[0][0].subject).toBe('Student Absence Alert');
  });

  it('does NOT email when the target user has no email address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: null,
      firstName: 'NoEmail',
    });

    await service.send({
      userId: 'user-2',
      title: 'x',
      message: 'y',
      type: NotificationType.EMAIL,
    });

    expect(mockPrisma.notification.create).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('swallows SMTP failures so the triggering operation never fails (Brevo down)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'p@example.com',
      firstName: 'P',
    });
    sendMail.mockRejectedValueOnce?.(new Error('ECONNREFUSED'));
    sendMail.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // send() must resolve even though the email dispatch throws
    await expect(
      service.send({
        userId: 'user-3',
        title: 'x',
        message: 'y',
        type: NotificationType.EMAIL,
      }),
    ).resolves.toBeDefined();
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it('sendBulk(EMAIL) batches the in-app rows and emails each user with an address', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@example.com', firstName: 'A' },
      { id: 'u2', email: 'b@example.com', firstName: 'B' },
      { id: 'u3', email: null, firstName: 'C' }, // skipped — no email
    ]);

    const result = await service.sendBulk({
      userIds: ['u1', 'u2', 'u3'],
      title: 'Term reports published',
      message: 'Your report card is ready',
      type: NotificationType.EMAIL,
    });

    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(2); // only u1 + u2
    expect(result).toEqual({ count: 3 });
  });
});
