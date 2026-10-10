import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  const build = () => {
    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      school: { findUnique: jest.fn() },
      currentSchoolId: jest.fn().mockResolvedValue('school-lnd'),
    };
    const delivery = {
      email: jest.fn().mockResolvedValue(undefined),
      sms: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountsService(prisma as never, delivery as never);
    return { service, prisma, delivery };
  };

  describe('finding the login for a new school record', () => {
    it('makes a new one when nobody signs in with either', async () => {
      const { service } = build();
      const login = await service.loginFor('k@markova.edu', '+250788100000');
      expect(login.isNew).toBe(true);
      expect(login.accountId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('uses the one that already exists', async () => {
      const { service, prisma } = build();
      prisma.account.findMany.mockResolvedValue([{ id: 'acc-ange' }]);
      await expect(service.loginFor(null, '+250788100000')).resolves.toEqual({
        accountId: 'acc-ange',
        isNew: false,
      });
    });

    it('refuses an email and a phone that are two different people', async () => {
      const { service, prisma } = build();
      prisma.account.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      await expect(
        service.loginFor('k@markova.edu', '+250788100000'),
      ).rejects.toThrow(ConflictException);
    });

    it('asks nothing when there is neither', async () => {
      const { service, prisma } = build();
      await service.loginFor(null, null);
      expect(prisma.account.findMany).not.toHaveBeenCalled();
    });
  });

  describe('writing the login', () => {
    it('writes a new one, with a password to change on first use', async () => {
      const { service, prisma } = build();
      await service.attach(
        prisma as never,
        { accountId: 'acc-new', isNew: true },
        { phone: '+250788100000', passwordHash: 'hash' },
      );
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          id: 'acc-new',
          email: null,
          phone: '+250788100000',
          passwordHash: 'hash',
          forcePasswordChange: true,
        },
      });
    });

    /* Somebody who already signs in keeps their password. */
    it('writes nothing for one that exists', async () => {
      const { service, prisma } = build();
      await service.attach(
        prisma as never,
        { accountId: 'acc-ange', isNew: false },
        { passwordHash: 'a-new-hash' },
      );
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('answers a clash with a moment-ago claim as a conflict', async () => {
      const { service, prisma } = build();
      prisma.account.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.attach(
          prisma as never,
          { accountId: 'acc-new', isNew: true },
          { email: 'k@markova.edu' },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('telling somebody a school added them', () => {
    it('emails them the school and the role', async () => {
      const { service, prisma, delivery } = build();
      prisma.school.findUnique.mockResolvedValue({ name: 'Lycee Notre Dame' });
      prisma.account.findUnique.mockResolvedValue({
        email: 'ange@gmail.com',
        phone: '+250788100000',
      });
      await service.tellAdded('acc-ange', 'PARENT');
      const sent = delivery.email.mock.calls[0][0];
      expect(sent.to).toBe('ange@gmail.com');
      expect(sent.body).toContain(
        'Lycee Notre Dame has added you as a parent on Markova.',
      );
      expect(sent.body).toContain('usual phone or email and password');
    });

    it('texts somebody with no email', async () => {
      const { service, prisma, delivery } = build();
      prisma.school.findUnique.mockResolvedValue({ name: 'Kigali Hill' });
      prisma.account.findUnique.mockResolvedValue({
        email: null,
        phone: '+250788100000',
      });
      await service.tellAdded('acc-ange', 'ADMIN');
      expect(delivery.sms.mock.calls[0][0].message).toContain(
        'Kigali Hill has added you as an admin',
      );
    });

    /* The person is added either way; a message that cannot go never undoes
       that. */
    it('never fails the save', async () => {
      const { service, prisma } = build();
      prisma.school.findUnique.mockRejectedValue(new Error('down'));
      await expect(
        service.tellAdded('acc-ange', 'PARENT'),
      ).resolves.toBeUndefined();
    });
  });
});
