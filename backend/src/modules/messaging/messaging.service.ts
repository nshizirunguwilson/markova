import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BroadcastAudience,
  BroadcastDto,
  CreateConversationDto,
  PreviewAudienceDto,
  SendMessageDto,
} from './dto';
import { NotificationSubject } from '../../common/notification-target';

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

    // An announcement is not a thread. If four hundred parents could reply
    // into it, the first reply would reach all four hundred, and the feature
    // would be switched off within a week.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      select: { type: true, createdByUserId: true },
    });
    if (
      conversation?.type === 'BROADCAST' &&
      conversation.createdByUserId !== senderUserId
    ) {
      throw new ForbiddenException(
        'This is an announcement. Message the school directly to reply.',
      );
    }

    return this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderUserId,
        content: dto.content,
        contentType: (dto.contentType as any) || 'TEXT',
        status: 'SENT',
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
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

  // ─── BROADCAST ────────────────────────────────────────────────────────────
  //
  // "Everyone in Senior 1's family needs to know by Friday" is the single most
  // common thing a school has to say, and the only tool for it today is a
  // photocopied letter handed to a child.

  /**
   * The user ids an audience resolves to.
   *
   * Parent audiences resolve through the students, because a parent belongs to
   * a class only by way of their child, and a parent with two children in
   * different years must appear once rather than twice.
   */
  private async resolveAudience(dto: PreviewAudienceDto): Promise<string[]> {
    const { audience, classLevelIds, classSectionIds } = dto;

    const needsLevels =
      audience === BroadcastAudience.PARENTS_OF_LEVELS ||
      audience === BroadcastAudience.STUDENTS_OF_LEVELS;
    const needsClasses =
      audience === BroadcastAudience.PARENTS_OF_CLASSES ||
      audience === BroadcastAudience.STUDENTS_OF_CLASSES;

    if (needsLevels && !classLevelIds?.length) {
      throw new BadRequestException('Choose at least one year level');
    }
    if (needsClasses && !classSectionIds?.length) {
      throw new BadRequestException('Choose at least one class');
    }

    const roleAudiences: Partial<Record<BroadcastAudience, Role[]>> = {
      [BroadcastAudience.ALL_PARENTS]: [Role.PARENT],
      [BroadcastAudience.ALL_TEACHERS]: [Role.TEACHER],
      [BroadcastAudience.ALL_STUDENTS]: [Role.STUDENT],
      [BroadcastAudience.ALL_STAFF]: [
        Role.TEACHER,
        Role.LIBRARIAN,
        Role.PATRON,
        Role.MATRON,
        Role.NURSE,
        Role.ADMIN,
      ],
    };

    const roles = roleAudiences[audience];
    if (roles) {
      const users = await this.prisma.user.findMany({
        // An inactive account cannot read it, and counting them makes the
        // number the sender sees a lie.
        where: { role: { in: roles }, isActive: true },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    // Only students who are actually on the roll today. A graduate's parents
    // do not need the Senior 1 trip letter.
    const studentWhere: any = {
      status: 'ACTIVE',
      ...(needsLevels
        ? { classSection: { classLevelId: { in: classLevelIds } } }
        : { classSectionId: { in: classSectionIds } }),
    };

    if (
      audience === BroadcastAudience.STUDENTS_OF_LEVELS ||
      audience === BroadcastAudience.STUDENTS_OF_CLASSES
    ) {
      const students = await this.prisma.student.findMany({
        where: { ...studentWhere, user: { isActive: true } },
        select: { userId: true },
      });
      return [...new Set(students.map((s) => s.userId))];
    }

    const links = await this.prisma.parentStudent.findMany({
      where: { student: studentWhere, parent: { isActive: true } },
      select: { parentUserId: true },
    });
    // A parent with two children in the same year is one recipient.
    return [...new Set(links.map((l) => l.parentUserId))];
  }

  /**
   * How many people an announcement would reach, before sending it.
   *
   * Nobody should find out they addressed four hundred families by doing it.
   */
  async previewAudience(dto: PreviewAudienceDto) {
    const userIds = await this.resolveAudience(dto);
    return { count: userIds.length };
  }

  async broadcast(dto: BroadcastDto, senderUserId: string) {
    const recipientIds = (await this.resolveAudience(dto)).filter(
      (id) => id !== senderUserId,
    );

    if (recipientIds.length === 0) {
      throw new BadRequestException(
        'Nobody matches that audience, so there is nobody to tell',
      );
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'BROADCAST',
        name: dto.title,
        createdByUserId: senderUserId,
        participants: {
          create: [
            { userId: senderUserId, isAdmin: true },
            ...recipientIds.map((userId) => ({ userId, isAdmin: false })),
          ],
        },
        messages: {
          create: {
            senderUserId,
            content: dto.message,
            contentType: dto.fileUrl ? 'FILE' : 'TEXT',
            fileUrl: dto.fileUrl,
            fileName: dto.fileName,
            status: 'SENT',
          },
        },
      },
      include: {
        messages: {
          include: {
            sender: {
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

    // The bell as well as the letter. A conversation nobody opens is a
    // conversation nobody read.
    await this.prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: 'PUSH' as const,
        title: dto.title,
        message: dto.message.slice(0, 300),
        // So the bell opens the announcement itself rather than just
        // reporting that one exists.
        relatedEntityType: NotificationSubject.ANNOUNCEMENT,
        relatedEntityId: conversation.id,
      })),
    });

    return {
      conversation,
      recipients: recipientIds.length,
      recipientIds,
    };
  }

  // ─── GROUP MEMBERSHIP ─────────────────────────────────────────────────────

  /**
   * Adding people to a group.
   *
   * Only an admin of the group, because a group anybody can add to is a group
   * that leaks: a parent added to the staff room sees everything said in it.
   */
  async addParticipants(
    conversationId: string,
    userIds: string[],
    byUserId: string,
  ) {
    await this.ensureGroupAdmin(conversationId, byUserId);

    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const already = new Set(existing.map((p) => p.userId));
    const toAdd = [...new Set(userIds)].filter((id) => !already.has(id));

    if (toAdd.length === 0) return { added: 0 };

    await this.prisma.conversationParticipant.createMany({
      data: toAdd.map((userId) => ({ conversationId, userId })),
      skipDuplicates: true,
    });
    return { added: toAdd.length };
  }

  /**
   * Removing somebody.
   *
   * The messages they already sent stay. A group's history is a record of what
   * was said, and rewriting it when a person leaves makes it useless.
   */
  async removeParticipant(
    conversationId: string,
    userId: string,
    byUserId: string,
  ) {
    // Leaving is always allowed; removing somebody else is not.
    if (userId !== byUserId) {
      await this.ensureGroupAdmin(conversationId, byUserId);
    } else {
      await this.ensureParticipant(conversationId, userId);
    }

    const admins = await this.prisma.conversationParticipant.count({
      where: { conversationId, isAdmin: true },
    });
    const leaving = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { isAdmin: true },
    });
    if (leaving?.isAdmin && admins <= 1) {
      throw new BadRequestException(
        'Make somebody else an admin first, or the group is left with nobody to manage it',
      );
    }

    await this.prisma.conversationParticipant.deleteMany({
      where: { conversationId, userId },
    });
    return { removed: true };
  }

  async renameConversation(
    conversationId: string,
    name: string,
    byUserId: string,
  ) {
    await this.ensureGroupAdmin(conversationId, byUserId);
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { name },
    });
  }

  async getParticipants(conversationId: string, userId: string) {
    await this.ensureParticipant(conversationId, userId);
    return this.prisma.conversationParticipant.findMany({
      where: { conversationId },
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
      orderBy: { joinedAt: 'asc' },
    });
  }

  private async ensureGroupAdmin(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type === 'ONE_ON_ONE') {
      throw new BadRequestException(
        'A one to one conversation has no membership to manage',
      );
    }

    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { isAdmin: true },
    });
    if (!participant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }
    if (!participant.isAdmin) {
      throw new ForbiddenException('Only a group admin can do that');
    }
  }
}
