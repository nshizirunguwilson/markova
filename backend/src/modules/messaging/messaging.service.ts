import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConversationDto, SendMessageDto } from './dto';

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  async createConversation(
    dto: CreateConversationDto,
    createdByUserId: string,
  ) {
    // For ONE_ON_ONE, check if conversation already exists
    if (dto.type === 'ONE_ON_ONE' && dto.participantUserIds.length === 1) {
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: 'ONE_ON_ONE',
          participants: {
            every: {
              userId: { in: [createdByUserId, dto.participantUserIds[0]] },
            },
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  photoUrl: true,
                },
              },
            },
          },
        },
      });
      if (existing) return existing;
    }

    const allParticipants = [
      createdByUserId,
      ...dto.participantUserIds.filter((id) => id !== createdByUserId),
    ];

    return this.prisma.conversation.create({
      data: {
        type: dto.type as any,
        name: dto.name,
        createdByUserId,
        participants: {
          create: allParticipants.map((userId, i) => ({
            userId,
            isAdmin: i === 0,
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async getConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
                role: true,
                lastSeenAt: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

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

  async getMessages(
    conversationId: string,
    userId: string,
    limit = 50,
    before?: string,
  ) {
    await this.ensureParticipant(conversationId, userId);

    const where: any = { conversationId };
    if (before) where.createdAt = { lt: new Date(before) };

    return this.prisma.message.findMany({
      where,
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, photoUrl: true },
        },
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
        status: 'SENT',
        fileUrl: dto.fileUrl,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, photoUrl: true },
        },
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
      select: { id: true, senderUserId: true },
    });

    if (unreadMessages.length === 0) return { count: 0, readMessageIds: [] };

    await this.prisma.messageRead.createMany({
      data: unreadMessages.map((m) => ({
        messageId: m.id,
        userId,
      })),
      skipDuplicates: true,
    });

    const readMessageIds = unreadMessages.map((m) => m.id);

    // Update message status to READ for messages where all participants have read
    // For simplicity: any read by a non-sender marks it as READ
    await this.prisma.message.updateMany({
      where: { id: { in: readMessageIds }, status: { not: 'READ' } },
      data: { status: 'READ' },
    });

    return { count: unreadMessages.length, readMessageIds };
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

  /**
   * Returns the users the current user is allowed to start a conversation with.
   * Staff (admin/teacher/librarian) can reach anyone; students and parents can
   * only message staff. This replaces the previous admin-only `/users` lookup
   * the message composer used, which 403'd for every non-admin role.
   */
  async getContacts(userId: string, search?: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!me) return { data: [] };

    const STAFF = ['ADMIN', 'TEACHER', 'LIBRARIAN'];
    const isStaff = STAFF.includes(me.role);

    const where: any = { isActive: true, id: { not: userId } };
    if (!isStaff) {
      where.role = { in: STAFF };
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        photoUrl: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 30,
    });
    return { data: users };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELIVERY STATUS METHODS (used by WebSocket gateway)
  // ═══════════════════════════════════════════════════════════════════════════

  async markDelivered(userId: string) {
    // Find all messages sent TO this user that are still in SENT status
    const messages = await this.prisma.message.findMany({
      where: {
        status: 'SENT',
        senderUserId: { not: userId },
        conversation: { participants: { some: { userId } } },
      },
      select: { id: true, senderUserId: true, conversationId: true },
    });

    if (messages.length === 0) return [];

    await this.prisma.message.updateMany({
      where: { id: { in: messages.map((m) => m.id) } },
      data: { status: 'DELIVERED' },
    });

    return messages;
  }

  async updateMessageStatus(
    messageId: string,
    status: 'SENT' | 'DELIVERED' | 'READ',
  ) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: status as any },
    });
  }

  async getUserConversationIds(userId: string): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    return participants.map((p) => p.conversationId);
  }

  async getConversationParticipantIds(
    conversationId: string,
  ): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return participants.map((p) => p.userId);
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
    });
    if (!participant)
      throw new ForbiddenException('Not a participant of this conversation');
  }
}
