import { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from './token-types';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { DeliveryQueue } from '../../jobs/delivery.queue';
import { Role } from '@prisma/client';
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../common/password';
import {
  LoginDto,
  VerifyOtpDto,
  ResendOtpDto,
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
const RESEND_COOLDOWN_SECONDS = 30; // min gap between OTP resends
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
    private delivery: DeliveryQueue,
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

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(identifier);
      throw new UnauthorizedException('Invalid credentials');
    }

    /*
      The one moment an old hash can be replaced.
      
      A password is only in memory during a sign-in. Raising the cost factor
      without this would apply to new accounts only, and the accounts that
      have existed longest, which are the ones most worth protecting, would
      keep the weaker hash for ever.

      Awaited rather than left running in the background. It costs about
      250ms, once, on the first sign-in after the cost factor changes and
      never again for that account, which is a fair price for a step that is
      deterministic: a floating promise here writes to the database after the
      request it belongs to has finished, which is a hard thing to reason
      about and an easy thing to get wrong.

      Wrapped, because a failed upgrade must not fail a sign-in that has
      already succeeded. The old hash still works; it is just still old.
    */
    if (needsRehash(user.passwordHash)) {
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(dto.password) },
        });
      } catch {
        this.logger.warn(`Could not upgrade the stored hash for ${user.id}`);
      }
    }

    // Clear failed attempts on success
    await this.redis.del('failed:' + identifier);

    // Students login directly (no OTP)
    if (user.role === Role.STUDENT) {
      return this.issueTokens(user.id, user.role, ipAddress, deviceInfo);
    }

    // For admin/teacher/parent/librarian - generate + send OTP
    const { sessionId, devOtp } = await this.createAndSendOtp(user);

    return {
      requiresOtp: true,
      sessionId,
      message: 'OTP sent to your registered contact',
      // Include OTP in dev mode for testing
      ...(devOtp && { devOtp }),
    };
  }

  // ─── RESEND OTP ────────────────────────────────────────────────────────────

  async resendOtp(dto: ResendOtpDto) {
    const sessionRaw = await this.redis.get('otp:' + dto.sessionId);
    if (!sessionRaw) {
      throw new UnauthorizedException('Invalid or expired OTP session');
    }
    const session = JSON.parse(sessionRaw) as { userId: string };

    // Rate-limit: one resend per RESEND_COOLDOWN_SECONDS per session
    const cooldownOk = await this.redis.set(
      'otp_resend:' + dto.sessionId,
      '1',
      'EX',
      RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooldownOk !== 'OK') {
      throw new HttpException(
        'Please wait a moment before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired OTP session');
    }

    // Reuse the same sessionId so the client doesn't have to swap it
    const { devOtp } = await this.createAndSendOtp(user, dto.sessionId);

    return {
      sessionId: dto.sessionId,
      message: 'A new verification code has been sent',
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      ...(devOtp && { devOtp }),
    };
  }

  // ─── Generate, store, and email an OTP (shared by login + resend) ───────────

  private async createAndSendOtp(
    user: {
      id: string;
      email: string | null;
      phone: string | null;
      firstName: string;
    },
    existingSessionId?: string,
  ): Promise<{ sessionId: string; devOtp?: string }> {
    const otp = this.generateOtp();
    const sessionId = existingSessionId ?? uuidv4();

    await this.redis.set(
      'otp:' + sessionId,
      JSON.stringify({
        userId: user.id,
        otp,
        expiresAt: new Date(
          Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
        ).toISOString(),
      }),
      'EX',
      OTP_TTL_SECONDS,
    );

    /**
     * Queued, not sent here.
     *
     * The code is already in Redis, so the session is valid whether or not the
     * email arrives, and the request must not wait on somebody else's mail
     * server. That much was already true: it was dispatched and not awaited.
     *
     * What was not true is that a failure meant anything. A momentary SMTP
     * problem dropped the code, once, and the member of staff simply could not
     * sign in: from their side it looked like the password was wrong. Queued,
     * it is six attempts over about fifteen minutes, marked urgent so it goes
     * ahead of a fees reminder, and a give-up that is written down.
     *
     * Fifteen minutes is chosen against the thing being sent rather than
     * plucked: a sign-in code has expired by then anyway, so trying longer
     * would deliver something already useless.
     */
    if (user.email) {
      await this.delivery.email({
        to: user.email,
        name: user.firstName,
        subject: 'Your Markova Verification Code',
        urgent: true,
        body: `<p style="font-size: 16px;">Your verification code is:</p>
         <p style="font-size: 32px; font-weight: bold; color: #1B4F72; letter-spacing: 4px; text-align: center; margin: 20px 0;">${otp}</p>
         <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not request this, please ignore this email.</p>`,
      });
    }
    // Who it went to, never the code. A code in the log lets anyone who can
    // read the log past the second step of sign in. Outside production it is
    // still returned below as devOtp.
    this.logger.log(`OTP sent to ${user.email || user.phone}`);

    return {
      sessionId,
      ...(this.configService.get('NODE_ENV') !== 'production' && {
        devOtp: otp,
      }),
    };
  }

  // ─── VERIFY OTP (Step 2) ───────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto, ipAddress?: string, deviceInfo?: string) {
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

    // OTP valid - clean up and issue tokens
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

      // Reject an access token presented here. Tokens minted before this claim
      // existed have no `typ` at all, so they are allowed through until they
      // expire and are replaced by a labelled pair.
      if (payload.typ && payload.typ !== REFRESH_TOKEN_TYPE) {
        throw new UnauthorizedException('Invalid refresh token');
      }

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
        // Another request is already refreshing this token - possible replay
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

    const valid = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        forcePasswordChange: false,
      },
    });

    /*
      Every other session ends with it.

      The usual reason somebody changes their password is that they think
      another person has it, and that is exactly the moment the other person's
      session has to stop working. Resetting a forgotten password already did
      this; changing a known one did not, which is the case where the user
      actively suspects something.

      Access tokens are stateless and last fifteen minutes, so a stolen one
      survives until it expires. Refresh is what makes a session persist, and
      that is gone immediately.
    */
    const { count } = await this.prisma.userSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return {
      message: 'Password changed successfully',
      signedOutElsewhere: count,
    };
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
      JSON.stringify({
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
      'EX',
      RESET_TOKEN_TTL_SECONDS,
    );

    if (user.email) {
      const appUrl =
        this.configService.get<string>('APP_URL') || 'http://localhost:3001';
      const resetLink = `${appUrl}/reset-password?token=${token}`;
      /* Queued for the same reason as the sign-in code: a reset link that
         fails to send leaves somebody locked out of their own account, and
         inline it failed silently. */
      await this.delivery.email({
        to: user.email,
        name: user.firstName,
        subject: 'Password Reset - Markova',
        urgent: true,
        body: `<p>You requested a password reset. Click the button below to set a new password:</p>
         <p style="text-align: center; margin: 24px 0;">
           <a href="${resetLink}" style="background:#1B4F72;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
         </p>
         <p style="font-size:12px;color:#666;">Or paste this link into your browser:<br>${resetLink}</p>
         <p>This link expires in 30 minutes. If you did not request this, please ignore this email.</p>`,
      });
    } else if (user.phone) {
      // Parents are commonly registered with a phone and no email at all.
      // Without this branch their reset token was only ever written to the
      // server log, so they could never recover an account.
      const appUrl =
        this.configService.get<string>('APP_URL') || 'http://localhost:3001';
      await this.delivery.sms({
        phone: user.phone,
        urgent: true,
        message: `Markova password reset: ${appUrl}/reset-password?token=${token} (expires in 30 minutes)`,
      });
    }
    // Who asked, never the token. A token in the log is a working reset link
    // for anyone who can read the log, in production as much as anywhere.
    // Outside production it is still returned below as devToken.
    this.logger.log(`Password reset requested for ${user.email || user.phone}`);

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

    const hash = await hashPassword(dto.newPassword);
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

  // ─── UPDATE PROFILE ────────────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string },
  ) {
    const data: Record<string, string> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;

    // Guard against a phone collision with another account.
    if (data.phone) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: data.phone, id: { not: userId } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException('That phone number is already in use');
      }
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
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
        // The profile page shows and manages it, and the report card prints
        // it where this person has to sign.
        signatureUrl: true,
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
        // A parent's linked children. The mobile dashboard reads these from the
        // profile; without them it showed "No children linked to your account"
        // to every parent, however many children they actually had.
        parentStudents: {
          select: {
            student: {
              select: {
                id: true,
                userId: true,
                classSectionId: true,
                studentIdNumber: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    photoUrl: true,
                  },
                },
                classSection: {
                  select: {
                    id: true,
                    name: true,
                    classLevel: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Flatten role-specific IDs onto the user object for convenience
    const { student, teacher, parentStudents, ...rest } = user as any;
    return {
      ...rest,
      ...(student && {
        studentId: student.id,
        classSectionId: student.classSectionId,
      }),
      ...(teacher && { teacherId: teacher.id }),
      // Shaped as `Student` (nested `user` and `classSection`), which is what
      // both clients already type these as.
      ...(parentStudents?.length && {
        children: parentStudents.map((link: any) => link.student),
      }),
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

    // `typ` says which kind of token this is. The two used to be
    // indistinguishable once decoded, so anything holding a refresh token could
    // present it wherever an access token was expected and get seven days of
    // access instead of fifteen minutes. Separate secrets are the primary
    // defence and are now enforced at boot; this is the second one, and it
    // holds even if the keys are ever misconfigured again.
    const accessToken = this.jwtService.sign(
      { ...payload, typ: ACCESS_TOKEN_TYPE, jti: uuidv4() },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, typ: REFRESH_TOKEN_TYPE, jti: uuidv4() },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_EXPIRY,
      },
    );

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
