import { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from './token-types';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
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
import { Prisma, Role, SchoolStatus } from '@prisma/client';
import { withPlatform, withSchool } from '../../prisma/request-context';
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
  ChangeLoginDto,
  ConfirmLoginChangeDto,
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

/** A school record, as the sign in and the school list need it. */
const MEMBER = {
  id: true,
  accountId: true,
  role: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  school: { select: { id: true, name: true, slug: true } },
} as const;

type Member = {
  id: string;
  accountId: string;
  role: Role;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  school: { id: string; name: string; slug: string };
};

/** The login, as the sign in needs it. */
type Login = {
  id: string;
  email: string | null;
  phone: string | null;
  lastUserId: string | null;
};

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

    /*
      The login, found by what the person typed. One login serves every
      school the person belongs to (docs/MULTI-SCHOOL-DESIGN.md), so this
      finds the person, not a school record; which school opens is decided
      once the password is right.
    */
    const account = await this.prisma.account.findFirst({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
    });

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    const identifier = account.id;
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
    if (!account.passwordHash) {
      throw new UnauthorizedException('Password not set');
    }

    const valid = await verifyPassword(dto.password, account.passwordHash);
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
    if (needsRehash(account.passwordHash)) {
      try {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { passwordHash: await hashPassword(dto.password) },
        });
      } catch {
        this.logger.warn(`Could not upgrade the stored hash for ${account.id}`);
      }
    }

    // Clear failed attempts on success
    await this.redis.del('failed:' + identifier);

    /*
      Somewhere to go. A login whose every school record is closed, or whose
      schools are all suspended, opens nothing. Checked after the password,
      so a stranger typing a number learns nothing about it.
    */
    const members = await this.membersOf(account.id);
    if (members.length === 0) {
      throw new ForbiddenException('Account is deactivated');
    }

    /*
      Students sign in without a code. A login that is anything more than a
      student anywhere gets the code, because it opens that too: a teacher
      at one school who studies at another is protected like a teacher.
    */
    if (members.every((m) => m.role === Role.STUDENT)) {
      return this.enter(account, members, ipAddress, deviceInfo);
    }

    // For admin/teacher/parent/librarian - generate + send OTP
    const { sessionId, devOtp } = await this.createAndSendOtp(
      account,
      members[0].firstName,
    );

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
    const session = JSON.parse(sessionRaw) as {
      accountId?: string;
      userId?: string;
    };

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

    const account = await this.loginOf(session);
    const members = account ? await this.membersOf(account.id) : [];
    if (!account || members.length === 0) {
      throw new UnauthorizedException('Invalid or expired OTP session');
    }

    // Reuse the same sessionId so the client doesn't have to swap it
    const { devOtp } = await this.createAndSendOtp(
      account,
      members[0].firstName,
      dto.sessionId,
    );

    return {
      sessionId: dto.sessionId,
      message: 'A new verification code has been sent',
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      ...(devOtp && { devOtp }),
    };
  }

  // ─── Generate, store, and email an OTP (shared by login + resend) ───────────

  private async createAndSendOtp(
    account: { id: string; email: string | null; phone: string | null },
    firstName: string,
    existingSessionId?: string,
  ): Promise<{ sessionId: string; devOtp?: string }> {
    const otp = this.generateOtp();
    const sessionId = existingSessionId ?? uuidv4();

    await this.redis.set(
      'otp:' + sessionId,
      JSON.stringify({
        accountId: account.id,
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
    if (account.email) {
      await this.delivery.email({
        to: account.email,
        name: firstName,
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
    this.logger.log(`OTP sent to ${account.email || account.phone}`);

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

    const account = await this.loginOf(session);
    const members = account ? await this.membersOf(account.id) : [];
    if (!account || members.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    return this.enter(account, members, ipAddress, deviceInfo);
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

      /*
        Still welcome in this school. A school record closed by its school, or
        a school the owner has suspended, ends the session here rather than
        being renewed for another week. The person signs in again and lands in
        one of their other schools.
      */
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          ...MEMBER,
          isActive: true,
          school: { select: { ...MEMBER.school.select, status: true } },
        },
      });

      if (
        !user ||
        !user.isActive ||
        user.school.status !== SchoolStatus.ACTIVE
      ) {
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

      return this.issueTokens(user, session.ipAddress, session.deviceInfo);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ─── CHANGE PASSWORD ───────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto) {
    /* The password belongs to the login, so this changes it for every school
       the person belongs to at once. */
    const account = await this.accountOfUser(userId);

    if (!account || !account.passwordHash) {
      throw new BadRequestException('User not found');
    }

    const valid = await verifyPassword(
      dto.currentPassword,
      account.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await hashPassword(dto.newPassword);
    await this.prisma.account.update({
      where: { id: account.id },
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
      where: { accountId: account.id, isActive: true },
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

    const user = await this.prisma.account.findFirst({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
      select: {
        id: true,
        email: true,
        phone: true,
        users: { select: { firstName: true }, take: 1 },
      },
    });

    // Always return success to prevent user enumeration
    if (!user) {
      return { message: 'If the account exists, a reset link has been sent' };
    }
    const firstName = user.users[0]?.firstName;

    const token = uuidv4();
    await this.redis.set(
      'reset:' + token,
      JSON.stringify({
        accountId: user.id,
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
        name: firstName,
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

    /* Links sent before logins existed name the person's record, whose id
       their login was given when the two were split. */
    const accountId: string = resetData.accountId ?? resetData.userId;

    const hash = await hashPassword(dto.newPassword);
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        passwordHash: hash,
        forcePasswordChange: false,
      },
    });

    await this.redis.del('reset:' + dto.token);

    // Invalidate all sessions
    await this.prisma.userSession.updateMany({
      where: { accountId },
      data: { isActive: false },
    });

    return { message: 'Password has been reset successfully' };
  }

  // ─── LOGOUT ────────────────────────────────────────────────────────────────

  async logout(accountId: string, token?: string) {
    /* Sessions belong to the login: signing out everywhere signs the person
       out of every school on every device. */
    if (token) {
      // Logout specific session
      await this.prisma.userSession.updateMany({
        where: { accountId, token, isActive: true },
        data: { isActive: false },
      });
    } else {
      // Logout all sessions
      await this.prisma.userSession.updateMany({
        where: { accountId, isActive: true },
        data: { isActive: false },
      });
    }

    return { message: 'Logged out successfully' };
  }

  // ─── GET SESSIONS ──────────────────────────────────────────────────────────

  async getSessions(accountId: string) {
    return this.prisma.userSession.findMany({
      where: { accountId, isActive: true },
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

  /**
   * The person's own details in this school: their name, and the phone the
   * school reaches them on.
   *
   * Not how they sign in. That belongs to their login, is shared with their
   * other schools, and changes only through `requestLoginChange`, after a
   * code. So the phone here is free to match anybody's: it is a contact
   * number, and a family can share one.
   */
  async updateProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string },
  ) {
    const data: Record<string, string> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  // ─── CHANGE HOW YOU SIGN IN ────────────────────────────────────────────────

  /**
   * Start changing the email or phone the person signs in with.
   *
   * Only the person can, because the login is shared with every school they
   * belong to and no one school may move it. A code goes to the new address,
   * and nothing changes until it comes back: that proves the person holds
   * it, so a typo cannot lock them out and nobody can point a login at
   * somebody else's phone.
   */
  async requestLoginChange(userId: string, dto: ChangeLoginDto) {
    const field = dto.email ? 'email' : dto.phone ? 'phone' : null;
    if (!field || (dto.email && dto.phone)) {
      throw new BadRequestException('Give a new email or a new phone number');
    }
    const value = (field === 'email' ? dto.email! : dto.phone!).trim();

    const account = await this.accountOfUser(userId);
    if (!account) throw new UnauthorizedException('User not found');
    if (account[field] === value) {
      throw new BadRequestException(`You already sign in with that ${field}`);
    }

    /* The person is signed in and is choosing their own address, so saying
       it is taken tells them nothing they could not learn by trying. */
    const taken = await withPlatform(() =>
      this.prisma.account.count({ where: { [field]: value } }),
    );
    if (taken) {
      throw new ConflictException(
        `That ${field === 'email' ? 'email' : 'phone number'} is already used to sign in to Markova`,
      );
    }

    const code = this.generateOtp();
    const sessionId = uuidv4();
    await this.redis.set(
      'login_change:' + sessionId,
      JSON.stringify({ accountId: account.id, field, value, code }),
      'EX',
      OTP_TTL_SECONDS,
    );

    if (field === 'email') {
      await this.delivery.email({
        to: value,
        subject: 'Confirm your new Markova sign in',
        urgent: true,
        body: `<p>Your code to start signing in to Markova with this email is:</p>
         <p style="font-size: 32px; font-weight: bold; color: #1B4F72; letter-spacing: 4px; text-align: center; margin: 20px 0;">${code}</p>
         <p>It expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not ask for this, ignore this email.</p>`,
      });
    } else {
      await this.delivery.sms({
        phone: value,
        urgent: true,
        message: `Your Markova code to sign in with this phone is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      });
    }
    this.logger.log(`Sign in change code sent to ${value}`);

    return {
      sessionId,
      message: `A code is on its way to ${value}`,
      ...(this.configService.get('NODE_ENV') !== 'production' && {
        devOtp: code,
      }),
    };
  }

  /**
   * Finish the change, with the code the new address received.
   *
   * The login changes once and every school sees it. Each school's contact
   * details that were the old address move with it, because they were the
   * same thing; a contact a school had set to something else stays as the
   * school set it.
   */
  async confirmLoginChange(userId: string, dto: ConfirmLoginChangeDto) {
    const raw = await this.redis.get('login_change:' + dto.sessionId);
    if (!raw) throw new BadRequestException('That code has expired');
    const pending = JSON.parse(raw) as {
      accountId: string;
      field: 'email' | 'phone';
      value: string;
      code: string;
    };

    const account = await this.accountOfUser(userId);
    if (!account || account.id !== pending.accountId) {
      throw new BadRequestException('That code has expired');
    }
    if (pending.code !== dto.code) {
      await this.redis.del('login_change:' + dto.sessionId);
      throw new BadRequestException(
        'That code is not right. Ask for a new one.',
      );
    }
    await this.redis.del('login_change:' + dto.sessionId);

    const { field, value } = pending;
    const old = account[field];
    try {
      await withPlatform(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.account.update({
            where: { id: account.id },
            data: { [field]: value },
          });
          if (old) {
            await tx.user.updateMany({
              where: { accountId: account.id, [field]: old },
              data: { [field]: value },
            });
          }
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Somebody started signing in with that a moment ago. Choose another.',
        );
      }
      throw error;
    }

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
        lastLoginAt: true,
        createdAt: true,
        school: { select: { id: true, name: true, slug: true } },
        /* How the person signs in, shown on their own profile only. */
        account: {
          select: { email: true, phone: true, forcePasswordChange: true },
        },
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
    const { student, teacher, parentStudents, account, ...rest } = user as any;
    return {
      ...rest,
      forcePasswordChange: account.forcePasswordChange,
      login: { email: account.email, phone: account.phone },
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

  // ─── YOUR SCHOOLS ──────────────────────────────────────────────────────────

  /**
   * Every school the signed-in person can open, with what is waiting in each.
   *
   * The list the switcher shows. One entry per school record, so a teacher
   * who is also a parent at the same school sees that school twice, once for
   * each role. Each count is read inside its own school, behind that school's
   * wall, as that record: nothing from one school is read while in another.
   */
  async schools(accountId: string, currentUserId: string) {
    const members = await this.membersOf(accountId);
    return Promise.all(
      members.map(async (m) => ({
        ...this.membership(m),
        current: m.id === currentUserId,
        unreadMessages: await withSchool(m.school.id, () =>
          this.prisma.message.count({
            where: {
              conversation: { participants: { some: { userId: m.id } } },
              senderUserId: { not: m.id },
              reads: { none: { userId: m.id } },
            },
          }),
        ),
      })),
    );
  }

  /**
   * Open another of the person's schools, without asking for the password.
   *
   * The person proved who they are when they signed in; the session they
   * hold says so. What is checked here is that the school record is theirs,
   * still open, and in a school that is not suspended. The session moves with
   * them: the refresh token in hand stops working and a new pair, for the
   * other school, takes its place.
   */
  async switchSchool(
    accountId: string,
    targetUserId: string,
    refreshToken: string,
  ) {
    const members = await this.membersOf(accountId);
    const target = members.find((m) => m.id === targetUserId);
    if (!target) {
      throw new NotFoundException('That school is not on your list');
    }

    const { count } = await this.prisma.userSession.updateMany({
      where: { accountId, token: refreshToken, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }

    const session = await this.prisma.userSession.findFirst({
      where: { accountId, token: refreshToken },
      select: { ipAddress: true, deviceInfo: true },
    });
    return {
      ...(await this.issueTokens(
        target,
        session?.ipAddress,
        session?.deviceInfo,
      )),
      schools: members.map((m) => this.membership(m)),
    };
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  /**
   * Into a school, at the end of a sign in.
   *
   * One school record: straight in. Several: the one used last, and if the
   * person has never chosen, the first, with `chooseSchool` set so the app
   * asks them which they meant before showing anything.
   */
  private async enter(
    account: Login,
    members: Member[],
    ipAddress?: string | null,
    deviceInfo?: string | null,
  ) {
    const last = members.find((m) => m.id === account.lastUserId);
    const tokens = await this.issueTokens(
      last ?? members[0],
      ipAddress,
      deviceInfo,
    );
    return {
      ...tokens,
      schools: members.map((m) => this.membership(m)),
      chooseSchool: members.length > 1 && !last,
    };
  }

  /** One line of the school list. */
  private membership(m: Member) {
    return {
      userId: m.id,
      role: m.role,
      school: m.school,
    };
  }

  /**
   * The school records a login may open: still open, in a school that is
   * not suspended, ordered so the list reads the same every time.
   *
   * Above the wall between schools, because a person's schools are by
   * definition more than the one they are in. It reads only this login's
   * own records.
   */
  private membersOf(accountId: string): Promise<Member[]> {
    return withPlatform(() =>
      this.prisma.user.findMany({
        where: {
          accountId,
          isActive: true,
          school: { status: SchoolStatus.ACTIVE },
        },
        select: MEMBER,
        orderBy: [{ school: { name: 'asc' } }, { role: 'asc' }],
      }),
    );
  }

  /** The login a pending code or reset link was made for. */
  private loginOf(pending: { accountId?: string; userId?: string }) {
    /* Codes made before logins existed name the person's record, whose id
       their login was given when the two were split. */
    const id = pending.accountId ?? pending.userId;
    if (!id) return Promise.resolve(null);
    return this.prisma.account.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, lastUserId: true },
    });
  }

  /** The login behind a school record. */
  private async accountOfUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        account: {
          select: {
            id: true,
            email: true,
            phone: true,
            passwordHash: true,
          },
        },
      },
    });
    return user?.account ?? null;
  }

  /**
   * A token pair for one school record.
   *
   * Each access token is for one person in one school with one role, which
   * is what every guard and every query already expects. `acc` names the
   * login, so the guard can check the record still belongs to it.
   *
   * Above the wall between schools: when switching, the person is still
   * inside the school they are leaving while this writes to the one they are
   * going to. It writes only their own session, record and login.
   */
  private issueTokens(
    member: Pick<Member, 'id' | 'accountId' | 'role'>,
    ipAddress?: string | null,
    deviceInfo?: string | null,
  ) {
    return withPlatform(async () => {
      const payload = {
        sub: member.id,
        acc: member.accountId,
        role: member.role,
      };

      // `typ` says which kind of token this is. The two used to be
      // indistinguishable once decoded, so anything holding a refresh token
      // could present it wherever an access token was expected and get seven
      // days of access instead of fifteen minutes. Separate secrets are the
      // primary defence and are now enforced at boot; this is the second one,
      // and it holds even if the keys are ever misconfigured again.
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

      // At most MAX_SESSIONS devices per person, across all their schools.
      const activeSessions = await this.prisma.userSession.findMany({
        where: { accountId: member.accountId, isActive: true },
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
          accountId: member.accountId,
          userId: member.id,
          token: refreshToken,
          ipAddress: ipAddress || null,
          deviceInfo: deviceInfo || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      /* Last opened, per school, and which school to open next time. */
      const now = new Date();
      await this.prisma.user.update({
        where: { id: member.id },
        data: { lastLoginAt: now },
      });
      await this.prisma.account.update({
        where: { id: member.accountId },
        data: { lastLoginAt: now, lastUserId: member.id },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: member.id },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          school: { select: { id: true, name: true, slug: true } },
          account: { select: { forcePasswordChange: true } },
        },
      });
      const { account, ...rest } = user!;

      return {
        accessToken,
        refreshToken,
        user: { ...rest, forcePasswordChange: account.forcePasswordChange },
      };
    });
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
