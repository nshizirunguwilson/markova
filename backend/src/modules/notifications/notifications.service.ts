import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, BulkNotificationDto } from './dto';
import * as nodemailer from 'nodemailer';
import { Twilio } from 'twilio';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;
  private twilioClient: Twilio | null = null;
  private twilioSenderId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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
          // Push notifications via Firebase — placeholder for Phase 2 (mobile)
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
      // Batch fetch all user emails at once, then send in parallel
      const users = await this.prisma.user.findMany({
        where: { id: { in: dto.userIds } },
        select: { id: true, email: true, firstName: true },
      });

      if (this.transporter) {
        const fromName = this.config.get('SMTP_FROM_NAME') || 'Markova School';
        const fromEmail =
          this.config.get('SMTP_FROM') || 'no-reply@markova.edu';

        const emailPromises = users
          .filter((u) => u.email)
          .map((u) =>
            this.transporter!.sendMail({
              from: `"${fromName}" <${fromEmail}>`,
              to: u.email!,
              subject: dto.title,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: #1B4F72; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">${fromName}</h1>
                  </div>
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
      // SMS/PUSH require per-user API calls — send in parallel
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

  async registerPushToken(userId: string, token: string, platform: string) {
    // Upsert — same token might be re-registered on app restart
    await this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, updatedAt: new Date() },
      create: { userId, token, platform },
    });
    return { success: true };
  }

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    // Send via Expo Push API
    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default' as const,
      title,
      body,
      data: data || {},
    }));

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      const result = await response.json();
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

  async sendSMSToPhone(phone: string, message: string) {
    if (!this.twilioClient) {
      this.logger.log(
        `[SMS] Twilio not configured — would send to ${phone}: ${message}`,
      );
      return;
    }

    try {
      await this.twilioClient.messages.create({
        body: message,
        from: this.twilioSenderId!,
        to: phone,
      });
      this.logger.log(`[SMS] Sent to ${phone}`);
    } catch (error) {
      this.logger.error(`[SMS] Failed to send to ${phone}:`, error.message);
    }
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

    const fromName = this.config.get('SMTP_FROM_NAME') || 'Markova School';
    const fromEmail = this.config.get('SMTP_FROM') || 'no-reply@markova.edu';

    await this.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: user.email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B4F72; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">${fromName}</h1>
          </div>
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
        `[Email] SMTP not configured — would send to ${email}: ${subject}`,
      );
      return;
    }

    const fromName = this.config.get('SMTP_FROM_NAME') || 'Markova School';
    const fromEmail = this.config.get('SMTP_FROM') || 'no-reply@markova.edu';

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1B4F72; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">${fromName}</h1>
            </div>
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
    } catch (error) {
      this.logger.error(`[Email] Failed to send to ${email}:`, error.message);
    }
  }
}
