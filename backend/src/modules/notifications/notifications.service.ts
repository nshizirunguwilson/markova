import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { withPlatform } from '../../prisma/request-context';
import { currentSchoolName } from '../../common/school-name';
import { CreateNotificationDto, BulkNotificationDto } from './dto';
import * as nodemailer from 'nodemailer';
import { Twilio } from 'twilio';
import { existsSync } from 'fs';
import { join } from 'path';

/** Referenced from the email HTML as `cid:<LOGO_CID>`. */
const LOGO_CID = 'markova-logo';
const LOGO_PATH = join(process.cwd(), 'assets', 'logo-horizontal-white.png');

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;
  private twilioClient: Twilio | null = null;
  private twilioSenderId: string | null = null;

  /**
   * Email clients (Gmail especially) strip `data:` URIs, so the logo is sent as
   * an embedded CID attachment instead. Returns an empty list if the asset is
   * missing, in which case the header falls back to the plain text name.
   */
  private logoAttachments(): nodemailer.SendMailOptions['attachments'] {
    if (!existsSync(LOGO_PATH)) return [];
    return [{ filename: 'markova-logo.png', path: LOGO_PATH, cid: LOGO_CID }];
  }

  /** Branded blue header band - white logo when available, else the name. */
  private emailHeader(fromName: string): string {
    const inner = existsSync(LOGO_PATH)
      ? `<img src="cid:${LOGO_CID}" alt="${fromName}" style="height: 34px; width: auto; display: block; margin: 0 auto;" />`
      : `<h1 style="margin: 0; font-size: 24px;">${fromName}</h1>`;
    return `<div style="background: #1B4F72; color: white; padding: 20px; text-align: center;">${inner}</div>`;
  }

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Who an email says it is from.
   *
   * Inside a school, the school: a fees reminder from Kigali Hill signed
   * "Markova School" leaves a parent at two schools guessing which. Outside
   * one (a sign in code, a reset link, which belong to the login), the
   * install's own name.
   */
  private senderName(): Promise<string> {
    return currentSchoolName(
      this.prisma,
      this.config.get('SMTP_FROM_NAME') || 'Markova School',
    );
  }

  onModuleInit() {
    const host = this.config.get('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(this.config.get('SMTP_PORT') || '587', 10),
        secure: false,
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASS'),
        },
      });
      this.logger.log(`SMTP configured via ${host}`);
    }

    const twilioSid = this.config.get('TWILIO_SID');
    const twilioToken = this.config.get('TWILIO_TOKEN');
    if (twilioSid && twilioToken) {
      this.twilioClient = new Twilio(twilioSid, twilioToken);
      this.twilioSenderId = this.config.get('TWILIO_SENDER_ID') || 'Markova';
      this.logger.log(
        `Twilio SMS configured with sender ID: ${this.twilioSenderId}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRALIZED SEND
  // ═══════════════════════════════════════════════════════════════════════════

  async send(dto: CreateNotificationDto) {
    // Store in DB for in-app list
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        message: dto.message,
        type: dto.type as any,
        relatedEntityType: dto.relatedEntityType,
        relatedEntityId: dto.relatedEntityId,
      },
    });

    /* Never out to a closed account: a person who passed away, or who has
       left the school. The bell keeps the entry; no phone rings. */
    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { isActive: true },
    });
    if (!recipient?.isActive) return notification;

    // Dispatch to external channel
    try {
      switch (dto.type) {
        case 'SMS':
          await this.sendSMS(dto.userId, dto.message);
          break;
        case 'EMAIL':
          await this.sendEmail(dto.userId, dto.title, dto.message);
          break;
        case 'PUSH':
          await this.sendPushNotification(dto.userId, dto.title, dto.message, {
            ...(dto.relatedEntityType && {
              relatedEntityType: dto.relatedEntityType,
            }),
            ...(dto.relatedEntityId && {
              relatedEntityId: dto.relatedEntityId,
            }),
          });
          break;
      }
    } catch (e) {
      // Log failure but don't fail the notification creation
      this.logger.error(
        `Failed to send ${dto.type} notification`,
        e instanceof Error ? e.stack : undefined,
      );
    }

    return notification;
  }

  async sendBulk(dto: BulkNotificationDto) {
    /* Only people whose account is open (see send()), read once with what
       an email needs. */
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds }, isActive: true },
      select: { id: true, email: true, firstName: true },
    });
    dto = { ...dto, userIds: users.map((u) => u.id) };

    // Batch-create all DB notifications at once (avoids N+1)
    await this.prisma.notification.createMany({
      data: dto.userIds.map((userId) => ({
        userId,
        title: dto.title,
        message: dto.message,
        type: dto.type as any,
      })),
    });

    // Dispatch external notifications in parallel
    if (dto.type === 'EMAIL') {
      if (this.transporter) {
        const fromName = await this.senderName();
        const fromEmail =
          this.config.get('SMTP_FROM') || 'no-reply@markova.edu';

        const emailPromises = users
          .filter((u) => u.email)
          .map((u) =>
            this.transporter!.sendMail({
              from: `"${fromName}" <${fromEmail}>`,
              to: u.email!,
              subject: dto.title,
              attachments: this.logoAttachments(),
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  ${this.emailHeader(fromName)}
                  <div style="padding: 20px; background: #f9f9f9;">
                    <p>Dear ${u.firstName || 'User'},</p>
                    <div style="margin: 16px 0;">${dto.message}</div>
                  </div>
                  <div style="padding: 12px 20px; background: #eee; text-align: center; font-size: 12px; color: #666;">
                    This is an automated message from ${fromName}. Please do not reply to this email.
                  </div>
                </div>
              `,
            }),
          );

        const results = await Promise.allSettled(emailPromises);
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          this.logger.error(
            `Failed to send ${failures.length}/${emailPromises.length} bulk emails`,
          );
        }
      }
    } else if (dto.type === 'SMS' || dto.type === 'PUSH') {
      // SMS/PUSH require per-user API calls - send in parallel
      const sendPromises = dto.userIds.map(
        (userId) =>
          dto.type === 'SMS'
            ? this.sendSMS(userId, dto.message)
            : Promise.resolve(), // PUSH placeholder
      );
      const results = await Promise.allSettled(sendPromises);
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        this.logger.error(
          `Failed to send ${failures.length}/${dto.userIds.length} bulk ${dto.type} notifications`,
        );
      }
    }

    return { count: dto.userIds.length };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IN-APP NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getUserNotifications(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUSH TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * A phone, for a login.
   *
   * Upserted on the token: the app re-registers on every start, and a phone
   * somebody else then signs in on moves to their login.
   */
  async registerPushToken(accountId: string, token: string, platform: string) {
    await this.prisma.pushToken.upsert({
      where: { token },
      update: { accountId, platform, updatedAt: new Date() },
      create: { accountId, token, platform },
    });
    return { success: true };
  }

  /**
   * Where a push for this school record goes, and how it is labelled.
   *
   * The phones of the record's login, whichever school was open when they
   * registered. For somebody in more than one school the title starts with
   * the school's name, or "Marks published" would not say whose.
   */
  private async pushTarget(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountId: true,
        schoolId: true,
        school: { select: { name: true } },
      },
    });
    if (!user) return null;
    const schools = await withPlatform(() =>
      this.prisma.user.count({
        where: {
          accountId: user.accountId,
          isActive: true,
          school: { status: 'ACTIVE' },
        },
      }),
    );
    return { ...user, named: schools > 1 };
  }

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const target = await this.pushTarget(userId);
    if (!target) return;
    const tokens = await this.prisma.pushToken.findMany({
      where: { accountId: target.accountId },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    // Send via Expo Push API. The data names the school record, so the app
    // can open the right school when the notification is tapped.
    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default' as const,
      title: target.named ? `${target.school.name}: ${title}` : title,
      body,
      data: { ...(data || {}), schoolId: target.schoolId, userId },
    }));

    try {
      const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify(messages),
      });
      const result = await response.json();

      // Expo replies per message; a DeviceNotRegistered ticket means the app
      // was uninstalled, so drop the token instead of retrying it forever.
      const tickets: any[] = Array.isArray(result?.data) ? result.data : [];
      const dead = tickets
        .map((ticket, i) =>
          ticket?.details?.error === 'DeviceNotRegistered'
            ? tokens[i]?.token
            : null,
        )
        .filter((t): t is string => Boolean(t));
      if (dead.length) {
        await this.prisma.pushToken.deleteMany({
          where: { token: { in: dead } },
        });
        this.logger.log(`Pruned ${dead.length} unregistered push token(s)`);
      }

      this.logger.log(
        `Push sent to ${tokens.length} devices for user ${userId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Push notification failed for user ${userId}:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SMS PROVIDER (configurable via env vars)
  // ═══════════════════════════════════════════════════════════════════════════

  private async sendSMS(userId: string, message: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user?.phone) return;

    await this.sendSMSToPhone(user.phone, message);
  }

  /**
   * Throws when the gateway refuses or cannot be reached. The delivery queue
   * retries only a job that fails, so swallowing the error here, as this used
   * to, meant a lost OTP was never tried again.
   */
  async sendSMSToPhone(phone: string, message: string) {
    if (!this.twilioClient) {
      // The body carries sign-in codes and reset links, so it is only ever
      // shown outside production, where it is how a developer signs in.
      const shown =
        this.config.get('NODE_ENV') === 'production' ? '' : `: ${message}`;
      this.logger.log(
        `[SMS] Twilio not configured - would send to ${phone}${shown}`,
      );
      return;
    }

    await this.twilioClient.messages.create({
      body: message,
      from: this.twilioSenderId!,
      to: phone,
    });
    this.logger.log(`[SMS] Sent to ${phone}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL (configurable SMTP via env vars)
  // ═══════════════════════════════════════════════════════════════════════════

  private async sendEmail(userId: string, subject: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user?.email) return;
    if (!this.transporter) return;

    const fromName = await this.senderName();
    const fromEmail = this.config.get('SMTP_FROM') || 'no-reply@markova.edu';

    await this.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: user.email,
      subject,
      attachments: this.logoAttachments(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${this.emailHeader(fromName)}
          <div style="padding: 20px; background: #f9f9f9;">
            <p>Dear ${user.firstName || 'User'},</p>
            <div style="margin: 16px 0;">${body}</div>
          </div>
          <div style="padding: 12px 20px; background: #eee; text-align: center; font-size: 12px; color: #666;">
            This is an automated message from ${fromName}. Please do not reply to this email.
          </div>
        </div>
      `,
    });
    this.logger.log(`Email sent to ${user.email}: ${subject}`);
  }

  async sendEmailToAddress(
    email: string,
    name: string,
    subject: string,
    body: string,
  ) {
    if (!this.transporter) {
      this.logger.log(
        `[Email] SMTP not configured - would send to ${email}: ${subject}`,
      );
      return;
    }

    const fromName = await this.senderName();
    const fromEmail = this.config.get('SMTP_FROM') || 'no-reply@markova.edu';

    // No try/catch here: a failure has to reach the delivery queue so it retries.
    await this.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject,
      attachments: this.logoAttachments(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${this.emailHeader(fromName)}
          <div style="padding: 20px; background: #f9f9f9;">
            <p>Dear ${name || 'User'},</p>
            <div style="margin: 16px 0;">${body}</div>
          </div>
          <div style="padding: 12px 20px; background: #eee; text-align: center; font-size: 12px; color: #666;">
            This is an automated message from ${fromName}. Please do not reply to this email.
          </div>
        </div>
      `,
    });
    this.logger.log(`[Email] Sent to ${email}: ${subject}`);
  }
}
