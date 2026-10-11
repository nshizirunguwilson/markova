import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { hashPassword } from '../../common/password';
import { AuthService } from './auth.service';

/**
 * One login, many schools: how signing in, the school list, switching and
 * changing how you sign in behave for a person who belongs to more than one
 * school. See docs/MULTI-SCHOOL-DESIGN.md.
 *
 * Jean is the example: he teaches at Kigali Hill and is a parent at Lycee
 * Notre Dame. One login, two school records.
 */

const KIGALI_HILL = {
  id: 'school-kh',
  name: 'Kigali Hill',
  slug: 'kigali-hill',
};
const LYCEE = { id: 'school-lnd', name: 'Lycee Notre Dame', slug: 'lycee' };

const teacherAtKH = {
  id: 'user-kh',
  accountId: 'acc-jean',
  role: 'TEACHER',
  firstName: 'Jean',
  lastName: 'Habimana',
  photoUrl: null,
  school: KIGALI_HILL,
};
const parentAtLycee = {
  ...teacherAtKH,
  id: 'user-lnd',
  role: 'PARENT',
  school: LYCEE,
};

let PASSWORD_HASH: string;

const build = () => {
  const prisma = {
    account: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([teacherAtKH, parentAtLycee]),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userSession: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        ipAddress: '10.0.0.1',
        deviceInfo: 'phone',
      }),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  /* The record the token answers with, for whichever school was opened. */
  prisma.user.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) =>
      Promise.resolve({
        ...(where.id === parentAtLycee.id ? parentAtLycee : teacherAtKH),
        email: 'jean@markova.edu',
        phone: '+250788555000',
        account: {
          id: 'acc-jean',
          email: 'jean@markova.edu',
          phone: '+250788555000',
          passwordHash: PASSWORD_HASH,
          forcePasswordChange: false,
        },
      }),
  );
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const jwt = {
    sign: jest.fn((payload: { typ: string }) => `token-${payload.typ}`),
    verify: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'NODE_ENV' ? 'development' : 'secret',
    ),
  };
  const delivery = {
    email: jest.fn().mockResolvedValue(undefined),
    sms: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    redis as never,
    delivery as never,
  );
  return { service, prisma, redis, jwt, delivery };
};

const jeansLogin = (lastUserId: string | null) => ({
  id: 'acc-jean',
  email: 'jean@markova.edu',
  phone: '+250788555000',
  passwordHash: PASSWORD_HASH,
  lastUserId,
});

beforeAll(async () => {
  PASSWORD_HASH = await hashPassword('Password123!');
});

describe('signing in with several schools', () => {
  /* The code step is the same for one school or many; what differs is
     where the person lands once it is done. */
  const signIn = async (lastUserId: string | null) => {
    const ctx = build();
    ctx.prisma.account.findUnique.mockResolvedValue(jeansLogin(lastUserId));
    ctx.redis.get.mockResolvedValue(
      JSON.stringify({
        accountId: 'acc-jean',
        otp: '123456',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    );
    const result = await ctx.service.verifyOtp({
      sessionId: 's-1',
      otp: '123456',
    });
    return { ...ctx, result };
  };

  it('opens the school used last', async () => {
    const { result, prisma } = await signIn('user-lnd');
    expect(result.user.id).toBe('user-lnd');
    expect(result.chooseSchool).toBe(false);
    expect(prisma.userSession.create.mock.calls[0][0].data).toMatchObject({
      accountId: 'acc-jean',
      userId: 'user-lnd',
    });
  });

  it('asks which school when the person has never chosen', async () => {
    const { result } = await signIn(null);
    expect(result.chooseSchool).toBe(true);
    expect(result.schools).toEqual([
      { userId: 'user-kh', role: 'TEACHER', school: KIGALI_HILL },
      { userId: 'user-lnd', role: 'PARENT', school: LYCEE },
    ]);
  });

  it('goes straight in with one school', async () => {
    const ctx = build();
    ctx.prisma.user.findMany.mockResolvedValue([teacherAtKH]);
    ctx.prisma.account.findUnique.mockResolvedValue(jeansLogin(null));
    ctx.redis.get.mockResolvedValue(
      JSON.stringify({
        accountId: 'acc-jean',
        otp: '123456',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    );
    const result = await ctx.service.verifyOtp({
      sessionId: 's-1',
      otp: '123456',
    });
    expect(result.chooseSchool).toBe(false);
    expect(result.user.id).toBe('user-kh');
  });

  it('puts the school and the login in the token', async () => {
    const { jwt } = await signIn('user-kh');
    expect(jwt.sign.mock.calls[0][0]).toMatchObject({
      sub: 'user-kh',
      acc: 'acc-jean',
      role: 'TEACHER',
    });
  });

  it('remembers the school it opened, for next time', async () => {
    const { prisma } = await signIn('user-lnd');
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-jean' },
      data: { lastLoginAt: expect.any(Date), lastUserId: 'user-lnd' },
    });
  });

  /* Only open records in schools that are not suspended are offered. */
  it('asks only for open records in active schools', async () => {
    const { prisma } = await signIn('user-kh');
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      accountId: 'acc-jean',
      isActive: true,
      school: { status: 'ACTIVE' },
    });
  });

  it('opens nothing for a login with no open school left', async () => {
    const ctx = build();
    ctx.prisma.user.findMany.mockResolvedValue([]);
    ctx.prisma.account.findFirst.mockResolvedValue(jeansLogin(null));
    await expect(
      ctx.service.login({
        email: 'jean@markova.edu',
        password: 'Password123!',
      }),
    ).rejects.toThrow('Account is deactivated');
  });

  it('skips the code only when every record is a student', async () => {
    const ctx = build();
    ctx.prisma.account.findFirst.mockResolvedValue(jeansLogin(null));
    ctx.prisma.user.findMany.mockResolvedValue([
      { ...teacherAtKH, role: 'STUDENT' },
      { ...parentAtLycee, role: 'TEACHER' },
    ]);
    const result = await ctx.service.login({
      email: 'jean@markova.edu',
      password: 'Password123!',
    });
    expect(result).toMatchObject({ requiresOtp: true });
  });
});

describe('the school list', () => {
  it('lists every school with what is waiting there', async () => {
    const { service, prisma } = build();
    prisma.message.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const list = await service.schools('acc-jean', 'user-kh');
    expect(list).toEqual([
      {
        userId: 'user-kh',
        role: 'TEACHER',
        school: KIGALI_HILL,
        current: true,
        unreadMessages: 2,
      },
      {
        userId: 'user-lnd',
        role: 'PARENT',
        school: LYCEE,
        current: false,
        unreadMessages: 1,
      },
    ]);
  });

  /* Each count is the record's own messages in its own school. */
  it('counts each school as its own record', async () => {
    const { service, prisma } = build();
    await service.schools('acc-jean', 'user-kh');
    const asked = prisma.message.count.mock.calls.map(
      (c) => c[0].where.reads.none.userId,
    );
    expect(asked).toEqual(['user-kh', 'user-lnd']);
  });
});

describe('switching school', () => {
  it('opens the other school with a new pair of tokens', async () => {
    const { service, prisma } = build();
    const result = await service.switchSchool(
      'acc-jean',
      'user-lnd',
      'old-refresh',
    );
    expect(result.user.id).toBe('user-lnd');
    expect(result.accessToken).toBe('token-access');
    expect(prisma.userSession.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-lnd',
      ipAddress: '10.0.0.1',
    });
  });

  it('ends the session it moved from', async () => {
    const { service, prisma } = build();
    await service.switchSchool('acc-jean', 'user-lnd', 'old-refresh');
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-jean', token: 'old-refresh', isActive: true },
      data: { isActive: false },
    });
  });

  /* Somebody else's record, a closed one, or one in a suspended school is
     simply not on the person's list. */
  it('refuses a school that is not on the list', async () => {
    const { service, prisma } = build();
    await expect(
      service.switchSchool('acc-jean', 'user-of-somebody-else', 'old-refresh'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it('refuses without a live session of this login', async () => {
    const { service, prisma } = build();
    prisma.userSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.switchSchool('acc-jean', 'user-lnd', 'stolen-or-spent'),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });
});

describe('a session in a school that has gone', () => {
  it('is not renewed once the school is suspended', async () => {
    const { service, prisma, jwt } = build();
    jwt.verify.mockReturnValue({ sub: 'user-kh', typ: 'refresh' });
    prisma.userSession.findFirst.mockResolvedValue({ id: 'sess-1' });
    prisma.user.findUnique.mockResolvedValue({
      ...teacherAtKH,
      isActive: true,
      school: { ...KIGALI_HILL, status: 'SUSPENDED' },
    });
    await expect(service.refreshToken({ refreshToken: 'r' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });
});

describe('changing how you sign in', () => {
  it('sends a code to the new email, not the old one', async () => {
    const { service, delivery, redis } = build();
    const result = await service.requestLoginChange('user-kh', {
      email: 'jean.h@gmail.com',
    });
    expect(delivery.email.mock.calls[0][0].to).toBe('jean.h@gmail.com');
    const stored = JSON.parse(redis.set.mock.calls[0][1]);
    expect(stored).toMatchObject({
      accountId: 'acc-jean',
      field: 'email',
      value: 'jean.h@gmail.com',
    });
    expect(result.devOtp).toBe(stored.code);
  });

  it('texts a code to a new phone', async () => {
    const { service, delivery } = build();
    await service.requestLoginChange('user-kh', { phone: '+250788999000' });
    expect(delivery.sms.mock.calls[0][0].phone).toBe('+250788999000');
  });

  it('changes nothing until the code comes back', async () => {
    const { service, prisma } = build();
    await service.requestLoginChange('user-kh', { phone: '+250788999000' });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('refuses one already used to sign in', async () => {
    const { service, prisma, delivery } = build();
    prisma.account.count.mockResolvedValue(1);
    await expect(
      service.requestLoginChange('user-kh', { phone: '+250788111111' }),
    ).rejects.toThrow(ConflictException);
    expect(delivery.sms).not.toHaveBeenCalled();
  });

  it('asks for exactly one of email and phone', async () => {
    const { service } = build();
    await expect(service.requestLoginChange('user-kh', {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.requestLoginChange('user-kh', {
        email: 'a@b.rw',
        phone: '+250788111111',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses the one already in use by the person', async () => {
    const { service } = build();
    await expect(
      service.requestLoginChange('user-kh', { phone: '+250788555000' }),
    ).rejects.toThrow(/already sign in/);
  });

  const pending = (code = '654321') =>
    JSON.stringify({
      accountId: 'acc-jean',
      field: 'phone',
      value: '+250788999000',
      code,
    });

  it('changes the login when the code is right', async () => {
    const { service, prisma, redis } = build();
    redis.get.mockResolvedValue(pending());
    await service.confirmLoginChange('user-kh', {
      sessionId: 's',
      code: '654321',
    });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-jean' },
      data: { phone: '+250788999000' },
    });
  });

  /* Each school's contact that was the old number moves with it; one a
     school set to something else is left as the school set it. */
  it('moves the contact details that were the old one', async () => {
    const { service, prisma, redis } = build();
    redis.get.mockResolvedValue(pending());
    await service.confirmLoginChange('user-kh', {
      sessionId: 's',
      code: '654321',
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-jean', phone: '+250788555000' },
      data: { phone: '+250788999000' },
    });
  });

  it('refuses a wrong code, and burns it', async () => {
    const { service, prisma, redis } = build();
    redis.get.mockResolvedValue(pending());
    await expect(
      service.confirmLoginChange('user-kh', { sessionId: 's', code: '000000' }),
    ).rejects.toThrow(BadRequestException);
    expect(redis.del).toHaveBeenCalledWith('login_change:s');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  /* A code is good only for the login it was sent for. */
  it("refuses a code meant for somebody else's login", async () => {
    const { service, prisma, redis } = build();
    redis.get.mockResolvedValue(
      JSON.stringify({
        accountId: 'acc-other',
        field: 'phone',
        value: '+250788999000',
        code: '654321',
      }),
    );
    await expect(
      service.confirmLoginChange('user-kh', { sessionId: 's', code: '654321' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});
