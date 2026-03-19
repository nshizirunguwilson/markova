import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConversationDto, SendMessageDto } from './dto';

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  async createConversation(dto: CreateConversationDto, createdByUserId: string) {
    // For ONE_ON_ONE, check if conversation already exists
    if (dto.type === 'ONE_ON_ONE' && dto.participantUserIds.length === 1) {
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: 'ONE_ON_ONE',
          participants: {
            every: { userId: { in: [createdByUserId, dto.participantUserIds[0]] } },
          },
        },
        include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, photoUrl: true } } } } },
      });
      if (existing) return existing;
    }

    const allParticipants = [createdByUserId, ...dto.participantUserIds.filter((id) => id !== createdByUserId)];

    return this.prisma.conversation.create({
      data: {
        type: dto.type as any,
        name: dto.name,
        createdByUserId,
        participants: {
          create: allParticipants.map((userId, i) => ({
            userId,
            isAdmin: i === 0, // creator is admin
          })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, photoUrl: true, role: true } } },
        },
      },
    });
  }

  async getConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, photoUrl: true, role: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate unread counts
    const result = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderUserId: { not: userId },
            reads: { none: { userId } },
          },
        });
        return {
          ...conv,
          lastMessage: conv.messages[0] || null,
          messages: undefined,
          unreadCount,
        };
      }),
    );

    return result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }

  async getMessages(conversationId: string, userId: string, limit = 50, before?: string) {
    // Verify user is participant
    await this.ensureParticipant(conversationId, userId);

    const where: any = { conversationId };
    if (before) where.createdAt = { lt: new Date(before) };

    return this.prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        reads: { select: { userId: true, readAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async sendMessage(dto: SendMessageDto, senderUserId: string) {
    await this.ensureParticipant(dto.conversationId, senderUserId);

    return this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderUserId,
        content: dto.content,
        contentType: (dto.contentType as any) || 'TEXT',
        fileUrl: dto.fileUrl,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
      },
    });
  }

  async markAsRead(conversationId: string, userId: string) {
    await this.ensureParticipant(conversationId, userId);

    const unreadMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderUserId: { not: userId },
        reads: { none: { userId } },
      },
      select: { id: true },
    });

    if (unreadMessages.length === 0) return { count: 0 };

    await this.prisma.messageRead.createMany({
      data: unreadMessages.map((m) => ({
        messageId: m.id,
        userId,
      })),
      skipDuplicates: true,
    });

    return { count: unreadMessages.length };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        conversation: { participants: { some: { userId } } },
        senderUserId: { not: userId },
        reads: { none: { userId } },
      },
    });
    return { unreadCount: count };
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
    });
    if (!participant) throw new ForbiddenException('Not a participant of this conversation');
  }
}
