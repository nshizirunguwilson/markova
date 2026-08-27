import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'Password123!';
let TEST_PASSWORD_HASH: string;

const makeUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  email: 'wilsonshizirungu@gmail.com',
  phone: '+250788000001',
  role: 'ADMIN',
  firstName: 'Test',
  lastName: 'User',
  photoUrl: null,
  isActive: true,
  passwordHash: TEST_PASSWORD_HASH,
  forcePasswordChange: false,
  lastLoginAt: null,
  createdAt: new Date(),
  ...overrides,
});

// ── Mock factories ───────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userSession: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-1', role: 'ADMIN' }),
};

const mockNotifications = {
  sendEmailToAddress: jest.fn().mockResolvedValue(undefined),
  // The real method is sendSMSToPhone. The old name here meant a parent's
  // reset SMS was never asserted, and the branch that sends it never run.
  sendSMSToPhone: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      JWT_SECRET: 'test-jwt-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      NODE_ENV: 'development',
    };
    return map[key];
  }),
};

// ── Test suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeAll(async () => {
    TEST_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 4); // low rounds for speed
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-apply default return values that clearAllMocks wiped
    mockJwt.sign.mockReturnValue('mock-token');
    mockJwt.verify.mockReturnValue({ sub: 'user-1', role: 'ADMIN' });
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.userSession.findMany.mockResolvedValue([]);
    mockPrisma.userSession.create.mockResolvedValue({});
    mockPrisma.userSession.update.mockResolvedValue({});
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
    mockNotifications.sendEmailToAddress.mockResolvedValue(undefined);
    mockNotifications.sendSMSToPhone.mockResolvedValue(undefined);
    mockConfig.get.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        JWT_SECRET: 'test-jwt-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        NODE_ENV: 'development',
      };
      return map[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── login() ──────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('should return tokens directly for STUDENT role (no OTP)', async () => {
      const student = makeUser({ role: 'STUDENT' });
      mockPrisma.user.findFirst.mockResolvedValue(student);
      mockPrisma.user.findUnique.mockResolvedValue(student);
      mockPrisma.user.update.mockResolvedValue(student);

      const result = await service.login({
        email: student.email,
        password: TEST_PASSWORD,
      });

      expect(result).toHaveProperty('accessToken', 'mock-token');
      expect(result).toHaveProperty('refreshToken', 'mock-token');
      expect(result).toHaveProperty('user');
      expect(result).not.toHaveProperty('requiresOtp');
    });

    it('should return requiresOtp + sessionId for ADMIN role', async () => {
      const admin = makeUser({ role: 'ADMIN' });
      mockPrisma.user.findFirst.mockResolvedValue(admin);

      const result = await service.login({
        email: admin.email,
        password: TEST_PASSWORD,
      });

      expect(result).toHaveProperty('requiresOtp', true);
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('message');
      expect(result).not.toHaveProperty('accessToken');
    });

    /**
     * Signing in must not wait on the mail server.
     *
     * The code is in Redis before the email is attempted, so the session is
     * valid whether or not the message ever arrives — and the sender swallows
     * its own failures, so awaiting it could not tell the caller anything.
     * Against a configured SMTP host that await cost about two seconds on
     * every single sign-in, with the user watching a spinner.
     */
    it('answers without waiting for the verification email', async () => {
      const admin = makeUser({ role: 'ADMIN' });
      mockPrisma.user.findFirst.mockResolvedValue(admin);

      let deliver: () => void = () => {};
      mockNotifications.sendEmailToAddress.mockReturnValue(
        new Promise<void>((resolve) => {
          deliver = resolve;
        }),
      );

      // The mail never lands, and login still answers.
      const result = await service.login({
        email: admin.email,
        password: TEST_PASSWORD,
      });

      expect(result).toHaveProperty('requiresOtp', true);
      expect(result).toHaveProperty('sessionId');
      deliver();
    });

    it('still sends the code, just not on the critical path', async () => {
      const admin = makeUser({ role: 'ADMIN' });
      mockPrisma.user.findFirst.mockResolvedValue(admin);

      await service.login({ email: admin.email, password: TEST_PASSWORD });

      expect(mockNotifications.sendEmailToAddress).toHaveBeenCalledWith(
        admin.email,
        admin.firstName,
        expect.stringMatching(/verification code/i),
        expect.any(String),
      );
    });

    // A mail server that refuses the message must not take the sign-in with
    // it: the code is already stored, and the next screen offers a resend.
    it('signs the user in even when the email is rejected', async () => {
      const admin = makeUser({ role: 'ADMIN' });
      mockPrisma.user.findFirst.mockResolvedValue(admin);
      mockNotifications.sendEmailToAddress.mockRejectedValue(
        new Error('550 mailbox unavailable'),
      );

      const result = await service.login({
        email: admin.email,
        password: TEST_PASSWORD,
      });

      expect(result).toHaveProperty('requiresOtp', true);
    });

    it('should return requiresOtp + sessionId for TEACHER role', async () => {
      const teacher = makeUser({ role: 'TEACHER' });
      mockPrisma.user.findFirst.mockResolvedValue(teacher);

      const result = await service.login({
        email: teacher.email,
        password: TEST_PASSWORD,
      });

      expect(result).toHaveProperty('requiresOtp', true);
      expect(result).toHaveProperty('sessionId');
    });

    it('should return requiresOtp + sessionId for PARENT role', async () => {
      const parent = makeUser({ role: 'PARENT' });
      mockPrisma.user.findFirst.mockResolvedValue(parent);

      const result = await service.login({
        email: parent.email,
        password: TEST_PASSWORD,
      });

      expect(result).toHaveProperty('requiresOtp', true);
      expect(result).toHaveProperty('sessionId');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'WrongPassword1!' }),
      ).rejects.toThrow(UnauthorizedException);

      // Should record the failed attempt in Redis
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: TEST_PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException for deactivated account', async () => {
      const deactivated = makeUser({ isActive: false });
      mockPrisma.user.findFirst.mockResolvedValue(deactivated);

      await expect(
        service.login({ email: deactivated.email, password: TEST_PASSWORD }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should record failed attempt in Redis on wrong password', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'WrongPassword1!' }),
      ).rejects.toThrow(UnauthorizedException);

      // recordFailedAttempt reads current attempts from Redis, then writes incremented value
      expect(mockRedis.get).toHaveBeenCalledWith('failed:' + user.id);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'failed:' + user.id,
        expect.stringContaining('"count":1'),
        'EX',
        expect.any(Number),
      );
    });

    it('should throw ForbiddenException when account is locked', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);

      // Simulate a locked account — lockedUntil is in the future
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ count: 5, lockedUntil }),
      );

      await expect(
        service.login({ email: user.email, password: TEST_PASSWORD }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when no email or phone provided', async () => {
      await expect(
        service.login({ password: TEST_PASSWORD } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── verifyOtp() ──────────────────────────────────────────────────────────

  describe('verifyOtp()', () => {
    const sessionId = 'test-session-id';
    const otp = '123456';

    it('should issue tokens on correct OTP', async () => {
      const user = makeUser();
      const sessionData = {
        userId: user.id,
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.verifyOtp({ sessionId, otp });

      expect(result).toHaveProperty('accessToken', 'mock-token');
      expect(result).toHaveProperty('refreshToken', 'mock-token');
      expect(result).toHaveProperty('user');
      // OTP session should be cleaned up
      expect(mockRedis.del).toHaveBeenCalledWith('otp:' + sessionId);
    });

    it('should throw and delete OTP on wrong code', async () => {
      const sessionData = {
        userId: 'user-1',
        otp: '999999',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));

      await expect(
        service.verifyOtp({ sessionId, otp: '000000' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRedis.del).toHaveBeenCalledWith('otp:' + sessionId);
    });

    it('should throw on expired/missing OTP session', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyOtp({ sessionId, otp })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw on expired OTP (expiresAt in the past)', async () => {
      const sessionData = {
        userId: 'user-1',
        otp,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // expired
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));

      await expect(service.verifyOtp({ sessionId, otp })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockRedis.del).toHaveBeenCalledWith('otp:' + sessionId);
    });
  });

  // ── refreshToken() ───────────────────────────────────────────────────────

  describe('refreshToken()', () => {
    const refreshToken = 'valid-refresh-token';

    it('should issue new tokens and deactivate old session', async () => {
      const user = makeUser();
      const session = {
        id: 'session-1',
        userId: user.id,
        token: refreshToken,
        isActive: true,
        ipAddress: '127.0.0.1',
        deviceInfo: 'Jest',
      };

      mockJwt.verify.mockReturnValue({ sub: user.id, role: user.role });
      mockPrisma.userSession.findFirst.mockResolvedValue(session);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      // Redis lock acquired successfully
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.refreshToken({ refreshToken });

      expect(result).toHaveProperty('accessToken', 'mock-token');
      expect(result).toHaveProperty('refreshToken', 'mock-token');
      // Old session deactivated
      expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { isActive: false },
      });
    });

    it('should throw when session already used (Redis lock fails)', async () => {
      const user = makeUser();
      const session = {
        id: 'session-1',
        userId: user.id,
        token: refreshToken,
        isActive: true,
        ipAddress: '127.0.0.1',
        deviceInfo: 'Jest',
      };

      mockJwt.verify.mockReturnValue({ sub: user.id, role: user.role });
      mockPrisma.userSession.findFirst.mockResolvedValue(session);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      // Redis NX lock fails — another request is already refreshing
      mockRedis.set.mockResolvedValue(null);

      await expect(service.refreshToken({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );

      // Session should be deactivated as a security measure
      expect(mockPrisma.userSession.update).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { isActive: false },
      });
    });

    it('should throw when refresh token is invalid (verify fails)', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        service.refreshToken({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when no active session matches', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', role: 'ADMIN' });
      mockPrisma.userSession.findFirst.mockResolvedValue(null);

      await expect(service.refreshToken({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── changePassword() ─────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('should reject wrong current password', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.changePassword(user.id, {
          currentPassword: 'WrongPassword1!',
          newPassword: 'NewSecure1!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should update password hash on correct current password', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.changePassword(user.id, {
        currentPassword: TEST_PASSWORD,
        newPassword: 'NewSecure1!',
      });

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          passwordHash: expect.any(String),
          forcePasswordChange: false,
        },
      });

      // Verify the saved hash is a valid bcrypt hash (not the old one)
      const savedHash =
        mockPrisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('NewSecure1!', savedHash)).toBe(true);
    });

    it('should throw BadRequestException for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('nonexistent', {
          currentPassword: TEST_PASSWORD,
          newPassword: 'NewSecure1!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProfile()', () => {
    const baseUser = {
      id: 'u1',
      email: null,
      phone: '+250788100000',
      role: 'PARENT',
      firstName: 'Solange',
      lastName: 'Hakizimana',
      isActive: true,
    };

    it("returns a parent's linked children", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        parentStudents: [
          {
            student: {
              id: 's1',
              studentIdNumber: 'STD-2026-0001',
              user: { firstName: 'Divine', lastName: 'Niyonkuru' },
              classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
            },
          },
        ],
      });

      const profile: any = await service.getProfile('u1');

      // Without this the mobile parent dashboard showed "No children linked to
      // your account" to every parent, however many they actually had.
      expect(profile.children).toHaveLength(1);
      expect(profile.children[0].user.firstName).toBe('Divine');
      expect(profile.children[0].classSection.classLevel.name).toBe('Senior 1');
      // The join table itself is never leaked to the client.
      expect(profile.parentStudents).toBeUndefined();
    });

    it('omits `children` entirely for a user with none', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        role: 'ADMIN',
        parentStudents: [],
      });

      const profile: any = await service.getProfile('u1');
      expect(profile.children).toBeUndefined();
    });

    it('flattens the student and teacher ids onto the profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        role: 'STUDENT',
        student: { id: 'stu-1', classSectionId: 'cs-1' },
        parentStudents: [],
      });

      const profile: any = await service.getProfile('u1');
      expect(profile.studentId).toBe('stu-1');
      expect(profile.classSectionId).toBe('cs-1');
      expect(profile.student).toBeUndefined();
    });

    it('throws when the user no longer exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('gone')).rejects.toThrow();
    });
  });

  /**
   * Sending the code again. Without a cooldown this endpoint is a free SMS
   * bill and a way to flood somebody's phone.
   */
  describe('resending a code', () => {
    it('refuses a session nobody started', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(service.resendOtp({ sessionId: 's-1' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a second request inside the cooldown', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ userId: 'user-1' }));
      // The NX set fails when the cooldown key is already there.
      mockRedis.set.mockResolvedValue(null);
      await expect(service.resendOtp({ sessionId: 's-1' })).rejects.toThrow(
        /wait a moment/i,
      );
    });

    it('refuses when the account has since gone', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ userId: 'user-1' }));
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resendOtp({ sessionId: 's-1' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // The same session id is reused, so the code the person is waiting on is
    // replaced rather than a second session being opened alongside it.
    it('replaces the code on the same session', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ userId: 'user-1' }));
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.resendOtp({ sessionId: 's-1' });
      expect(result.sessionId).toBe('s-1');
      const otpWrite = mockRedis.set.mock.calls.find((c) =>
        String(c[0]).startsWith('otp:'),
      );
      expect(otpWrite![0]).toBe('otp:s-1');
    });

    it('sends the code to the address on the account', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ userId: 'user-1' }));
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      await service.resendOtp({ sessionId: 's-1' });
      expect(mockNotifications.sendEmailToAddress).toHaveBeenCalledWith(
        'wilsonshizirungu@gmail.com',
        'Test',
        expect.stringContaining('Verification Code'),
        expect.any(String),
      );
    });
  });

  /**
   * The code itself. Six digits, expiring in five minutes, and never returned
   * to the caller outside development.
   */
  describe('the one-time code', () => {
    it('is six digits', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      const result: any = await service.login({
        email: 'wilsonshizirungu@gmail.com',
        password: TEST_PASSWORD,
      });
      expect(result.devOtp).toMatch(/^\d{6}$/);
    });

    it('is different each time', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      const codes = new Set<string>();
      for (let i = 0; i < 25; i++) {
        const result: any = await service.login({
          email: 'wilsonshizirungu@gmail.com',
          password: TEST_PASSWORD,
        });
        codes.add(result.devOtp);
      }
      // Six digits and 25 draws: a repeat would be a sign the source is not
      // random rather than bad luck.
      expect(codes.size).toBeGreaterThan(20);
    });

    /**
     * `devOtp` exists so the demo and the browser tests can sign in. In
     * production it would hand the second factor to anybody who can reach the
     * login endpoint.
     */
    it('is never returned to the caller in production', async () => {
      mockConfig.get.mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : 'x',
      );
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());

      const result: any = await service.login({
        email: 'wilsonshizirungu@gmail.com',
        password: TEST_PASSWORD,
      });
      expect(result).not.toHaveProperty('devOtp');
      expect(result.requiresOtp).toBe(true);
    });

    it('is stored with an expiry rather than for ever', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      await service.login({
        email: 'wilsonshizirungu@gmail.com',
        password: TEST_PASSWORD,
      });
      const write = mockRedis.set.mock.calls.find((c) =>
        String(c[0]).startsWith('otp:'),
      );
      expect(write![2]).toBe('EX');
      expect(write![3]).toBe(300);
    });
  });

  /**
   * Password reset. The reply is deliberately identical whether or not the
   * account exists, because a different answer is a way to discover who has
   * an account at the school.
   */
  describe('asking for a password reset', () => {
    it('refuses a request naming neither an email nor a phone', async () => {
      await expect(service.requestPasswordReset({})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('answers the same for an account that does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await service.requestPasswordReset({
        email: 'nobody@markova.edu',
      });
      expect(result.message).toMatch(/if the account exists/i);
      expect(result).not.toHaveProperty('devToken');
    });

    it('answers the same for one that does', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      const result = await service.requestPasswordReset({
        email: 'wilsonshizirungu@gmail.com',
      });
      expect(result.message).toMatch(/if the account exists/i);
    });

    it('emails a link that carries the token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      const result: any = await service.requestPasswordReset({
        email: 'wilsonshizirungu@gmail.com',
      });
      const html = mockNotifications.sendEmailToAddress.mock.calls[0][3];
      expect(html).toContain(`/reset-password?token=${result.devToken}`);
    });

    /**
     * Most parents here have a phone and no email at all. Without this branch
     * their token only ever reached the server log, so they could never
     * recover an account.
     */
    it('texts the link to somebody who has no email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ email: null, phone: '+250788100000' }),
      );
      await service.requestPasswordReset({ phone: '+250788100000' });
      expect(mockNotifications.sendSMSToPhone).toHaveBeenCalledWith(
        '+250788100000',
        expect.stringContaining('/reset-password?token='),
      );
      expect(mockNotifications.sendEmailToAddress).not.toHaveBeenCalled();
    });

    it('stores the token with an expiry', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      await service.requestPasswordReset({
        email: 'wilsonshizirungu@gmail.com',
      });
      const write = mockRedis.set.mock.calls.find((c) =>
        String(c[0]).startsWith('reset:'),
      );
      expect(write![2]).toBe('EX');
      expect(write![3]).toBe(3600);
    });

    it('never returns the token in production', async () => {
      mockConfig.get.mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : 'x',
      );
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      const result = await service.requestPasswordReset({
        email: 'wilsonshizirungu@gmail.com',
      });
      expect(result).not.toHaveProperty('devToken');
    });
  });

  describe('completing a password reset', () => {
    it('refuses a token nobody issued', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 'nope', newPassword: 'NewPass123!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses one that has expired, and removes it', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          userId: 'user-1',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      );
      await expect(
        service.resetPassword({ token: 't-1', newPassword: 'NewPass123!' }),
      ).rejects.toThrow(/expired/i);
      expect(mockRedis.del).toHaveBeenCalledWith('reset:t-1');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('stores the new password hashed, never in the clear', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});
      await service.resetPassword({ token: 't-1', newPassword: 'NewPass123!' });
      const data = mockPrisma.user.update.mock.calls[0][0].data;
      expect(data.passwordHash).not.toBe('NewPass123!');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    // Whoever set the password chose it, so they are not made to choose again.
    it('clears the forced password change', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});
      await service.resetPassword({ token: 't-1', newPassword: 'NewPass123!' });
      expect(
        mockPrisma.user.update.mock.calls[0][0].data.forcePasswordChange,
      ).toBe(false);
    });

    /**
     * A reset is what somebody does when they think their account is
     * compromised. Leaving the intruder's session alive would defeat it.
     */
    it('signs every existing session out', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});
      await service.resetPassword({ token: 't-1', newPassword: 'NewPass123!' });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isActive: false },
      });
    });

    // A token that still worked after use would let anybody who saw the link
    // reset the password again.
    it('burns the token', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});
      await service.resetPassword({ token: 't-1', newPassword: 'NewPass123!' });
      expect(mockRedis.del).toHaveBeenCalledWith('reset:t-1');
    });
  });

  describe('signing out', () => {
    it('ends only the session the token belongs to', async () => {
      await service.logout('user-1', 'the-refresh-token');
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', token: 'the-refresh-token', isActive: true },
        data: { isActive: false },
      });
    });

    // Signing out of every device is what somebody does after losing a phone.
    it('ends every session when no token is given', async () => {
      await service.logout('user-1');
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        data: { isActive: false },
      });
    });

    it('lists only the sessions still live', async () => {
      mockPrisma.userSession.findMany.mockResolvedValue([]);
      await service.getSessions('user-1');
      expect(mockPrisma.userSession.findMany.mock.calls[0][0].where).toEqual({
        userId: 'user-1',
        isActive: true,
      });
    });

    // The refresh token itself is the session's key. Listing it would hand a
    // stolen laptop's browser storage the keys to every other device.
    it('never lists the token itself', async () => {
      mockPrisma.userSession.findMany.mockResolvedValue([]);
      await service.getSessions('user-1');
      const select = mockPrisma.userSession.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('token');
    });
  });

  describe('changing your own details', () => {
    beforeEach(() => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.user.findFirst.mockResolvedValue(null);
    });

    it('changes only what was sent', async () => {
      await service.updateProfile('user-1', { firstName: 'Wilson' });
      expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({
        firstName: 'Wilson',
      });
    });

    /**
     * A phone number is a login identifier here. Two accounts sharing one
     * would make it ambiguous which of them a sign-in belongs to.
     */
    it('refuses a phone number another account already uses', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'somebody-else' });
      await expect(
        service.updateProfile('user-1', { phone: '+250788000001' }),
      ).rejects.toThrow(/already in use/i);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('lets a person keep their own number', async () => {
      await service.updateProfile('user-1', { phone: '+250788000001' });
      expect(mockPrisma.user.findFirst.mock.calls[0][0].where.id).toEqual({
        not: 'user-1',
      });
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('does not go looking for a clash when the phone is untouched', async () => {
      await service.updateProfile('user-1', { lastName: 'Nshizirungu' });
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  /**
   * Three sessions at once. Beyond that the oldest is ended, so a school
   * account cannot quietly be shared across a staffroom.
   */
  describe('how many devices at once', () => {
    it('keeps at most three sessions', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      mockPrisma.userSession.findMany.mockResolvedValue([
        { id: 's-1' },
        { id: 's-2' },
        { id: 's-3' },
      ]);

      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s-1'] } },
        data: { isActive: false },
      });
    });

    it('ends the oldest first', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      mockPrisma.userSession.findMany.mockResolvedValue([]);
      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      expect(mockPrisma.userSession.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });

    it('ends nothing when there is room', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      mockPrisma.userSession.findMany.mockResolvedValue([{ id: 's-1' }]);
      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled();
    });

    /**
     * The two tokens were once indistinguishable once decoded, so a refresh
     * token could be presented wherever an access token was expected and buy
     * seven days of access instead of fifteen minutes.
     */
    it('labels the two tokens differently', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      const [access, refresh] = mockJwt.sign.mock.calls;
      expect(access[0].typ).not.toBe(refresh[0].typ);
      expect(access[1].expiresIn).toBe('15m');
      expect(refresh[1].expiresIn).toBe('7d');
    });

    it('signs the refresh token with its own secret', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      const refresh = mockJwt.sign.mock.calls[1];
      expect(refresh[1].secret).toBe('test-refresh-secret');
    });

    it('gives each token its own id', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      const [access, refresh] = mockJwt.sign.mock.calls;
      expect(access[0].jti).toBeTruthy();
      expect(access[0].jti).not.toBe(refresh[0].jti);
    });

    it('never answers with the password hash', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'student1@markova.edu',
        role: 'STUDENT',
      });
      const result: any = await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      expect(JSON.stringify(result.user)).not.toContain('$2');
    });
  });

  /**
   * An access token presented where a refresh token belongs is refused by
   * its label as well as by its secret.
   */
  describe('a token presented in the wrong place', () => {
    it('refuses an access token at the refresh endpoint', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'user-1',
        role: 'ADMIN',
        typ: 'access',
      });
      await expect(
        service.refreshToken({ refreshToken: 'an-access-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.userSession.findFirst).not.toHaveBeenCalled();
    });

    // Tokens minted before the claim existed carry no `typ` at all, and must
    // keep working until they expire.
    it('still accepts an older token that carries no label', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', role: 'ADMIN' });
      mockPrisma.userSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        ipAddress: '41.74.160.1',
        deviceInfo: 'iPhone',
      });
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockRedis.set.mockResolvedValue('OK');

      await expect(
        service.refreshToken({ refreshToken: 'an-old-token' }),
      ).resolves.toHaveProperty('accessToken');
    });

    it('refuses a refresh from an account since deactivated', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', role: 'ADMIN' });
      mockPrisma.userSession.findFirst.mockResolvedValue({ id: 'sess-1' });
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ isActive: false }),
      );
      await expect(
        service.refreshToken({ refreshToken: 'a-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('the account lockout', () => {
    it('locks after five wrong passwords', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ count: 4, lockedUntil: null }),
      );

      await expect(
        service.login({
          email: 'wilsonshizirungu@gmail.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);

      const write = mockRedis.set.mock.calls.find((c) =>
        String(c[0]).startsWith('failed:'),
      );
      expect(JSON.parse(write![1]).lockedUntil).toBeTruthy();
    });

    it('does not lock on the fourth', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ count: 3, lockedUntil: null }),
      );
      await expect(
        service.login({
          email: 'wilsonshizirungu@gmail.com',
          password: 'wrong',
        }),
      ).rejects.toThrow();
      const write = mockRedis.set.mock.calls.find((c) =>
        String(c[0]).startsWith('failed:'),
      );
      expect(JSON.parse(write![1]).lockedUntil).toBeNull();
    });

    // A successful sign-in clears the count, or a person who mistypes twice a
    // day would eventually be locked out for no reason.
    it('clears the count on a successful sign-in', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ role: 'STUDENT' }),
      );
      await service.login({
        email: 'student1@markova.edu',
        password: TEST_PASSWORD,
      });
      expect(mockRedis.del).toHaveBeenCalledWith('failed:user-1');
    });

    it('refuses an account whose password was never set', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ passwordHash: null }),
      );
      await expect(
        service.login({
          email: 'wilsonshizirungu@gmail.com',
          password: TEST_PASSWORD,
        }),
      ).rejects.toThrow(/password not set/i);
    });
  });
});

/**
 * Signing in the way each kind of person actually does.
 *
 * A teacher signs in with an email, a parent with a phone and no email at all.
 * The one-time code follows the same split: it is emailed where there is an
 * address and only logged where there is not, which is the difference between
 * a parent who can sign in and one who cannot.
 */
describe('the two ways into the system', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('mock-token');
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockPrisma.userSession.findMany.mockResolvedValue([]);
    mockPrisma.userSession.create.mockResolvedValue({});
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
    mockNotifications.sendEmailToAddress.mockResolvedValue(undefined);
    mockNotifications.sendSMSToPhone.mockResolvedValue(undefined);
    mockConfig.get.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        JWT_SECRET: 'test-jwt-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        NODE_ENV: 'development',
      };
      return map[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('looks a teacher up by their email', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());

    await service.login({
      email: 'a.uwase@markova.edu',
      password: TEST_PASSWORD,
    });

    expect(mockPrisma.user.findFirst.mock.calls[0][0].where).toEqual({
      email: 'a.uwase@markova.edu',
    });
  });

  // The first fifteen parents on a Rwandan school's roll have no email at all.
  it('looks a parent up by their phone number', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ role: 'PARENT', email: null }),
    );

    await service.login({
      phone: '+250788100000',
      password: TEST_PASSWORD,
    });

    expect(mockPrisma.user.findFirst.mock.calls[0][0].where).toEqual({
      phone: '+250788100000',
    });
  });

  it('emails the code to somebody who has an address', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());

    await service.login({
      email: 'wilsonshizirungu@gmail.com',
      password: TEST_PASSWORD,
    });

    expect(mockNotifications.sendEmailToAddress).toHaveBeenCalled();
  });

  it('emails nobody when there is no address to email', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ email: null }));

    const result: any = await service.login({
      phone: '+250788000001',
      password: TEST_PASSWORD,
    });

    expect(mockNotifications.sendEmailToAddress).not.toHaveBeenCalled();
    // The code still exists; in development it comes back for the demo.
    expect(result.devOtp).toMatch(/^\d{6}$/);
  });
});

/**
 * A session whose user has since been deleted.
 *
 * The one-time code lives in Redis and outlives the row it points at. An
 * account removed between the password and the code leaves a session id that
 * verifies fine and resolves to nobody.
 */
describe('a code for an account that is gone', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('mock-token');
    mockRedis.del.mockResolvedValue(1);
    mockConfig.get.mockImplementation(() => 'x');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('refuses rather than issuing tokens for nobody', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ userId: 'user-gone', otp: '123456', attempts: 0 }),
    );
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.verifyOtp({ sessionId: 'session-1', otp: '123456' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
