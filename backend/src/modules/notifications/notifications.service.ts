import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, BulkNotificationDto } from './dto';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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
      select: { email: true },
    });
    if (!user?.email) return;

    const smtpHost = this.config.get('SMTP_HOST');
    if (!smtpHost) return; // Email not configured

    // TODO: Implement nodemailer with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    console.log(`[EMAIL] Would send to ${user.email}: ${subject}`);
  }
}
