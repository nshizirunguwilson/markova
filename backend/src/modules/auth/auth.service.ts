import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory store for OTP sessions and failed attempts
  // In production, use Redis
  private otpStore = new Map<
    string,
    { userId: string; otp: string; expiresAt: Date }
  >();
  private failedAttempts = new Map<
    string,
    { count: number; lockedUntil: Date | null }
  >();
  private resetTokens = new Map<
    string,
    { userId: string; expiresAt: Date }
  >();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
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
    const attempts = this.failedAttempts.get(identifier);
    if (attempts?.lockedUntil && attempts.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (attempts.lockedUntil.getTime() - Date.now()) / 60000,
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
      this.recordFailedAttempt(identifier);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts on success
    this.failedAttempts.delete(identifier);

    // Students login directly (no OTP)
    if (user.role === Role.STUDENT) {
      return this.issueTokens(user.id, user.role, ipAddress, deviceInfo);
    }

    // For admin/teacher/parent/librarian — generate OTP
    const otp = this.generateOtp();
    const sessionId = uuidv4();
    this.otpStore.set(sessionId, {
      userId: user.id,
      otp,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    });

    // In production, send OTP via SMS/email
    this.logger.log(
      `OTP for ${user.email || user.phone}: ${otp} (session: ${sessionId})`,
    );

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
    const session = this.otpStore.get(dto.sessionId);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired OTP session');
    }

    if (session.expiresAt < new Date()) {
      this.otpStore.delete(dto.sessionId);
      throw new UnauthorizedException('OTP has expired');
    }

    if (session.otp !== dto.otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // OTP valid — clean up and issue tokens
    this.otpStore.delete(dto.sessionId);

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
    this.resetTokens.set(token, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    });

    // In production, send via email/SMS
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
    const resetData = this.resetTokens.get(dto.token);

    if (!resetData) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetData.expiresAt < new Date()) {
      this.resetTokens.delete(dto.token);
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

    this.resetTokens.delete(dto.token);

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
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
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
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private recordFailedAttempt(identifier: string) {
    const current = this.failedAttempts.get(identifier) || {
      count: 0,
      lockedUntil: null,
    };
    current.count += 1;

    if (current.count >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = new Date(
        Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
      this.logger.warn(`Account locked for user ${identifier}`);
    }

    this.failedAttempts.set(identifier, current);
  }
}
