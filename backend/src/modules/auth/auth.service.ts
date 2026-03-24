import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';
import {
  LoginDto,
  VerifyOtpDto,
  RefreshTokenDto,
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto';

const MAX_SESSIONS = 3;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const OTP_EXPIRY_MINUTES = 5;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const OTP_TTL_SECONDS = OTP_EXPIRY_MINUTES * 60; // 300s (5 min)
const FAILED_ATTEMPTS_TTL_SECONDS = 900; // 15 min
const RESET_TOKEN_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── LOGIN (Step 1) ────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, deviceInfo?: string) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email or phone is required');
    }

    // Find user
    const user = await this.prisma.user.findFirst({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    // Check lockout
    const identifier = user.id;
    const attemptsRaw = await this.redis.get('failed:' + identifier);
    const attempts = attemptsRaw
      ? JSON.parse(attemptsRaw)
      : { count: 0, lockedUntil: null };

    if (attempts.lockedUntil && new Date(attempts.lockedUntil) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(attempts.lockedUntil).getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account locked. Try again in ${minutesLeft} minutes.`,
      );
    }

    // Verify password
    if (!user.passwordHash) {
      throw new UnauthorizedException('Password not set');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(identifier);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts on success
    await this.redis.del('failed:' + identifier);

    // Students login directly (no OTP)
    if (user.role === Role.STUDENT) {
      return this.issueTokens(user.id, user.role, ipAddress, deviceInfo);
    }

    // For admin/teacher/parent/librarian — generate OTP
    const otp = this.generateOtp();
    const sessionId = uuidv4();
    await this.redis.set(
      'otp:' + sessionId,
      JSON.stringify({ userId: user.id, otp, expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString() }),
      'EX',
      OTP_TTL_SECONDS,
    );

    // Send OTP via SMS
    if (user.phone) {
      await this.notificationsService.sendSMSToPhone(
        user.phone,
        `Your Markova verification code is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      );
    }
    this.logger.log(`OTP for ${user.email || user.phone}: ${otp} (session: ${sessionId})`);

    return {
      requiresOtp: true,
      sessionId,
      message: 'OTP sent to your registered contact',
      // Include OTP in dev mode for testing
      ...(this.configService.get('NODE_ENV') !== 'production' && {
        devOtp: otp,
      }),
    };
  }

  // ─── VERIFY OTP (Step 2) ───────────────────────────────────────────────────

  async verifyOtp(
    dto: VerifyOtpDto,
    ipAddress?: string,
    deviceInfo?: string,
  ) {
    const sessionRaw = await this.redis.get('otp:' + dto.sessionId);

    if (!sessionRaw) {
      throw new UnauthorizedException('Invalid or expired OTP session');
    }

    const session = JSON.parse(sessionRaw);

    if (new Date(session.expiresAt) < new Date()) {
      await this.redis.del('otp:' + dto.sessionId);
      throw new UnauthorizedException('OTP has expired');
    }

    if (session.otp !== dto.otp) {
      await this.redis.del('otp:' + dto.sessionId);
      throw new UnauthorizedException('Invalid OTP');
    }

    // OTP valid — clean up and issue tokens
    await this.redis.del('otp:' + dto.sessionId);

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user.id, user.role, ipAddress, deviceInfo);
  }

  // ─── REFRESH TOKEN ─────────────────────────────────────────────────────────

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Check session is still active
      const session = await this.prisma.userSession.findFirst({
        where: {
          userId: payload.sub,
          token: dto.refreshToken,
          isActive: true,
        },
      });

      if (!session) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Issue new tokens
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Use Redis to prevent race conditions on refresh token reuse
      const lockKey = `refresh_lock:${session.id}`;
      const acquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
      if (!acquired) {
        // Another request is already refreshing this token — possible replay
        await this.prisma.userSession.update({
          where: { id: session.id },
          data: { isActive: false },
        });
        throw new UnauthorizedException('Refresh token already used');
      }

      // Deactivate old session
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { isActive: false },
      });

      return this.issueTokens(
        user.id,
        user.role,
        session.ipAddress,
        session.deviceInfo,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ─── CHANGE PASSWORD ───────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new BadRequestException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        forcePasswordChange: false,
      },
    });

    return { message: 'Password changed successfully' };
  }

  // ─── REQUEST PASSWORD RESET ────────────────────────────────────────────────

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email or phone is required');
    }

    const user = await this.prisma.user.findFirst({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
    });

    // Always return success to prevent user enumeration
    if (!user) {
      return { message: 'If the account exists, a reset link has been sent' };
    }

    const token = uuidv4();
    await this.redis.set(
      'reset:' + token,
      JSON.stringify({ userId: user.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
      'EX',
      RESET_TOKEN_TTL_SECONDS,
    );

    if (user.phone) {
      await this.notificationsService.sendSMSToPhone(
        user.phone,
        `Your Markova password reset code is: ${token.slice(0, 8).toUpperCase()}. It expires in 30 minutes.`,
      );
    }
    this.logger.log(`Password reset token for ${user.email || user.phone}: ${token}`);

    return {
      message: 'If the account exists, a reset link has been sent',
      ...(this.configService.get('NODE_ENV') !== 'production' && {
        devToken: token,
      }),
    };
  }

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const resetRaw = await this.redis.get('reset:' + dto.token);

    if (!resetRaw) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const resetData = JSON.parse(resetRaw);

    if (new Date(resetData.expiresAt) < new Date()) {
      await this.redis.del('reset:' + dto.token);
      throw new BadRequestException('Reset token has expired');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: resetData.userId },
      data: {
        passwordHash: hash,
        forcePasswordChange: false,
      },
    });

    await this.redis.del('reset:' + dto.token);

    // Invalidate all sessions
    await this.prisma.userSession.updateMany({
      where: { userId: resetData.userId },
      data: { isActive: false },
    });

    return { message: 'Password has been reset successfully' };
  }

  // ─── LOGOUT ────────────────────────────────────────────────────────────────

  async logout(userId: string, token?: string) {
    if (token) {
      // Logout specific session
      await this.prisma.userSession.updateMany({
        where: { userId, token, isActive: true },
        data: { isActive: false },
      });
    } else {
      // Logout all sessions
      await this.prisma.userSession.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    }

    return { message: 'Logged out successfully' };
  }

  // ─── GET SESSIONS ──────────────────────────────────────────────────────────

  async getSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── GET PROFILE ───────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        isActive: true,
        forcePasswordChange: true,
        lastLoginAt: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            classSectionId: true,
          },
        },
        teacher: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Flatten role-specific IDs onto the user object for convenience
    const { student, teacher, ...rest } = user as any;
    return {
      ...rest,
      ...(student && { studentId: student.id, classSectionId: student.classSectionId }),
      ...(teacher && { teacherId: teacher.id }),
    };
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    role: string,
    ipAddress?: string | null,
    deviceInfo?: string | null,
  ) {
    const payload = { sub: userId, role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    // Enforce max sessions
    const activeSessions = await this.prisma.userSession.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (activeSessions.length >= MAX_SESSIONS) {
      // Deactivate oldest sessions
      const toDeactivate = activeSessions.slice(
        0,
        activeSessions.length - MAX_SESSIONS + 1,
      );
      await this.prisma.userSession.updateMany({
        where: { id: { in: toDeactivate.map((s) => s.id) } },
        data: { isActive: false },
      });
    }

    // Create new session
    await this.prisma.userSession.create({
      data: {
        userId,
        token: refreshToken,
        ipAddress: ipAddress || null,
        deviceInfo: deviceInfo || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        forcePasswordChange: true,
      },
    });

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  private generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  private async recordFailedAttempt(identifier: string) {
    const currentRaw = await this.redis.get('failed:' + identifier);
    const current = currentRaw
      ? JSON.parse(currentRaw)
      : { count: 0, lockedUntil: null };

    current.count += 1;

    if (current.count >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = new Date(
        Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
      ).toISOString();
      this.logger.warn(`Account locked for user ${identifier}`);
    }

    await this.redis.set(
      'failed:' + identifier,
      JSON.stringify(current),
      'EX',
      FAILED_ATTEMPTS_TTL_SECONDS,
    );
  }
}
