import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, BulkNotificationDto } from './dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private transporter: nodemailer.Transporter | null = null;

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
      console.log(`[EMAIL] SMTP configured via ${host}`);
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
      console.error(`Failed to send ${dto.type} notification:`, e);
    }

    return notification;
  }

  async sendBulk(dto: BulkNotificationDto) {
    const results = [];
    for (const userId of dto.userIds) {
      const notification = await this.send({
        userId,
        title: dto.title,
        message: dto.message,
        type: dto.type,
      });
      results.push(notification);
    }
    return { count: results.length, notifications: results };
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
  // SMS PROVIDER (configurable via env vars)
  // ═══════════════════════════════════════════════════════════════════════════

  private async sendSMS(userId: string, message: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user?.phone) return;

    const provider = this.config.get('SMS_PROVIDER'); // 'africastalking' or 'twilio'
    if (!provider) return; // SMS not configured

    // TODO: Implement actual SMS providers
    // Africa's Talking: uses AT_API_KEY, AT_USERNAME, AT_SENDER_ID
    // Twilio: uses TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE
    console.log(`[SMS] Would send to ${user.phone}: ${message}`);
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
    const fromEmail = this.config.get('SMTP_FROM') || 'noreply@wilsonn.tech';

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
    console.log(`[EMAIL] Sent to ${user.email}: ${subject}`);
  }
}
