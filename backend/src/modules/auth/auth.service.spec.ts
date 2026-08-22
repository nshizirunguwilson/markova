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
  sendSmsToNumber: jest.fn().mockResolvedValue(undefined),
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
});
