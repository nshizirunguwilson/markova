import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  keptOutOfApp,
  peopleWithPhotos,
  withoutPhotos,
} from '../../common/photo-consent';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MENTION_REFUSAL,
  parseMentions,
  plainText,
  refuseMention,
  whoToNotify,
} from '../../common/mentions';
import {
  BroadcastAudience,
  BroadcastDto,
  CreateConversationDto,
  PreviewAudienceDto,
  SendMessageDto,
} from './dto';
import { NotificationSubject } from '../../common/notification-target';
import { pausesOn, schoolDay, untilWords } from '../../common/student-standing';

/** Who is in a conversation, as the check for a watcher reads them. */
const PRESENT = {
  userId: true,
  watching: true,
  user: { select: { role: true, isActive: true } },
} as const;
type Present = {
  userId: string;
  watching: boolean;
  user: { role: Role; isActive: boolean };
};

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  async createConversation(
    dto: CreateConversationDto,
    createdByUserId: string,
  ) {
    // Only people this person could have found in their contacts.
    await this.refuseUnreachable(createdByUserId, dto.participantUserIds);

    // For ONE_ON_ONE, check if conversation already exists. Whoever watches
    // over it is not one of the two people talking.
    if (dto.type === 'ONE_ON_ONE' && dto.participantUserIds.length === 1) {
      const pair = [createdByUserId, dto.participantUserIds[0]];
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: 'ONE_ON_ONE',
          AND: pair.map((userId) => ({ participants: { some: { userId } } })),
          participants: {
            none: { userId: { notIn: pair }, watching: false },
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
      ...new Set(dto.participantUserIds.filter((id) => id !== createdByUserId)),
    ];
    const watchers = await this.watchersNeeded(
      { type: dto.type },
      await this.newcomers(allParticipants),
    );

    return this.prisma.conversation.create({
      data: {
        type: dto.type as any,
        name: dto.name,
        createdByUserId,
        participants: {
          create: [
            ...allParticipants.map((userId, i) => ({
              userId,
              isAdmin: i === 0,
            })),
            ...watchers.map((userId) => ({ userId, watching: true })),
          ],
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

  // ═══════════════════════════════════════════════════════════════════════════
  // THE CLASS GROUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The name a class group carries: the class, as the school says it.
   */
  private classGroupName(section: {
    name: string;
    classLevel?: { name: string } | null;
    trade?: { code: string } | null;
  }): string {
    return [section.classLevel?.name, section.trade?.code, section.name]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Everyone who belongs in a class's group.
   *
   * The class, and whoever is responsible for it. A class teacher is set
   * through TeacherRole; a class that has not been given one falls to the
   * administrator, because a room of thirty children with no adult in it is
   * not a room a school would allow.
   */
  private async classGroupMembers(classSectionId: string): Promise<string[]> {
    const [students, classTeacher, admin] = await Promise.all([
      this.prisma.student.findMany({
        where: { classSectionId, status: 'ACTIVE', user: { isActive: true } },
        select: { userId: true },
      }),
      this.prisma.teacherRole.findFirst({
        where: { role: 'CLASS_TEACHER', classSectionId },
        select: { teacher: { select: { userId: true } } },
      }),
      this.prisma.user.findFirst({
        where: { role: Role.ADMIN, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
    ]);

    const responsible = classTeacher?.teacher?.userId ?? admin?.id;
    return [
      ...new Set(
        [...students.map((s) => s.userId), responsible].filter(Boolean),
      ),
    ] as string[];
  }

  /**
   * Make sure a class has its group, and that the group has the class in it.
   *
   * Reconciled rather than created once: a student who joined last week
   * belongs in it, and one who has left does not. Doing that here means the
   * group is right whenever somebody looks, without a nightly job to forget
   * to run.
   */
  async ensureClassGroup(classSectionId: string): Promise<string | null> {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      select: {
        id: true,
        name: true,
        classLevel: { select: { name: true } },
        trade: { select: { code: true } },
        groupChat: { select: { id: true, name: true } },
      },
    });
    if (!section) return null;

    const wanted = await this.classGroupMembers(classSectionId);
    // A class with nobody in it and no adult to answer for it has no group.
    if (wanted.length === 0) return section.groupChat?.id ?? null;

    const name = this.classGroupName(section);

    if (!section.groupChat) {
      const created = await this.prisma.conversation.create({
        data: {
          type: 'GROUP',
          name,
          classSectionId,
          // Whoever answers for the class owns the room.
          createdByUserId: wanted[wanted.length - 1],
          participants: { create: wanted.map((userId) => ({ userId })) },
        },
        select: { id: true },
      });
      return created.id;
    }

    const groupId = section.groupChat.id;
    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
      select: { userId: true },
    });
    const have = new Set(existing.map((p) => p.userId));
    const want = new Set(wanted);

    const toAdd = wanted.filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !want.has(id));

    if (toAdd.length > 0) {
      await this.prisma.conversationParticipant.createMany({
        data: toAdd.map((userId) => ({ conversationId: groupId, userId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length > 0) {
      await this.prisma.conversationParticipant.deleteMany({
        where: { conversationId: groupId, userId: { in: toRemove } },
      });
    }
    // The class may have been renamed since.
    if (section.groupChat.name !== name) {
      await this.prisma.conversation.update({
        where: { id: groupId },
        data: { name },
      });
    }

    return groupId;
  }

  /**
   * The class groups this person belongs in, made sure of before their
   * conversations are listed.
   *
   * A student has one - their own class. A class teacher has one per class
   * they answer for. Everybody else has none, and pays nothing for the
   * check.
   */
  private async ensureMyClassGroups(userId: string): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        student: { select: { classSectionId: true, status: true } },
        teacher: {
          select: {
            roles: {
              where: { role: 'CLASS_TEACHER' },
              select: { classSectionId: true },
            },
          },
        },
      },
    });
    if (!me) return;

    const sections: string[] = [];
    if (me.student?.classSectionId && me.student.status === 'ACTIVE') {
      sections.push(me.student.classSectionId);
    }
    for (const role of me.teacher?.roles ?? []) {
      if (role.classSectionId) sections.push(role.classSectionId);
    }

    for (const sectionId of [...new Set(sections)]) {
      await this.ensureClassGroup(sectionId);
    }
  }

  async getConversations(userId: string) {
    // The class group is not something anyone has to create or be invited to.
    await this.ensureMyClassGroups(userId);

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
                // Two children in a school of fourteen hundred share a name
                // more often than not. The class is what tells them apart,
                // and it is the first thing a teacher would ask.
                student: {
                  select: {
                    studentIdNumber: true,
                    classSection: {
                      select: {
                        name: true,
                        classLevel: { select: { name: true } },
                        trade: { select: { code: true } },
                      },
                    },
                  },
                },
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

  /**
   * What a quoted message needs to show.
   *
   * The line of text, who said it, and what kind of thing it was - enough to
   * draw the bar above a reply without loading the whole message a second
   * time. Not nested further: a reply to a reply quotes the message it
   * answers, not the whole chain behind it.
   */
  private static readonly QUOTED = {
    select: {
      id: true,
      content: true,
      contentType: true,
      senderUserId: true,
      sender: { select: { firstName: true, lastName: true } },
    },
  } as const;

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
        replyTo: MessagingService.QUOTED,
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
      select: {
        id: true,
        type: true,
        name: true,
        createdByUserId: true,
        classSectionId: true,
        participants: {
          select: {
            userId: true,
            isAdmin: true,
            watching: true,
            user: { select: { role: true, isActive: true } },
          },
        },
      },
    });

    /*
      Somebody watches over a chat between a student and an adult before
      anything more is said in it. Checked on every message rather than only
      when the chat was made: a lead named today, or one who has left, changes
      who should be watching chats that already exist.
    */
    const watchers = conversation
      ? await this.watchersNeeded(conversation, conversation.participants ?? [])
      : [];
    if (conversation && watchers.length > 0) {
      await this.prisma.conversationParticipant.createMany({
        data: watchers.map((userId) => ({
          conversationId: conversation.id,
          userId,
          watching: true,
        })),
        skipDuplicates: true,
      });
    }
    if (
      conversation?.type === 'BROADCAST' &&
      conversation.createdByUserId !== senderUserId
    ) {
      throw new ForbiddenException(
        'This is an announcement. Message the school directly to reply.',
      );
    }

    /* A suspended student keeps the class chat, to follow what the class is
       doing, and cannot post in it until they are back. */
    if (conversation?.classSectionId) {
      const student = await this.prisma.student.findUnique({
        where: { userId: senderUserId },
        select: { id: true },
      });
      const pause = student
        ? (await pausesOn(this.prisma, [student.id], schoolDay())).get(
            student.id,
          )
        : undefined;
      if (pause?.kind === 'SUSPENDED') {
        throw new ForbiddenException(
          `You are suspended ${untilWords(pause.endsOn)}. You can read the class chat, and post in it again when you are back.`,
        );
      }
    }

    /*
      Mentions are checked before the message is stored, and refused rather
      than quietly stripped. A mention silently turned into plain text is the
      one failure the whole design exists to prevent: the sender believes
      somebody was told, and nobody was.
    */
    const participantIds = [
      ...(conversation?.participants ?? []).map((p) => p.userId),
      ...watchers,
    ];
    const refusal = refuseMention(dto.content ?? '', {
      conversationType: conversation?.type ?? 'GROUP',
      participantIds,
      senderIsAdmin: (conversation?.participants ?? []).some(
        (p) => p.userId === senderUserId && p.isAdmin,
      ),
    });
    if (refusal) throw new BadRequestException(MENTION_REFUSAL[refusal]);

    // A reply has to answer something in this conversation. Pointing at a
    // message in another thread would quote text the sender was never allowed
    // to read, straight into a room where others can see it.
    if (dto.replyToId) {
      const original = await this.prisma.message.findFirst({
        where: { id: dto.replyToId, conversationId: dto.conversationId },
        select: { id: true },
      });
      if (!original) {
        throw new BadRequestException(
          'That message is not in this conversation',
        );
      }
    }

    /*
      The mention rows are written with the message rather than after it, so
      a message can never exist carrying markup that notified nobody.
    */
    const named = whoToNotify(dto.content ?? '', {
      participantIds,
      senderId: senderUserId,
    });
    const byName = new Set(
      parseMentions(dto.content ?? '').map((m) => m.userId),
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderUserId,
        content: dto.content,
        contentType: (dto.contentType as any) || 'TEXT',
        status: 'SENT',
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        replyToId: dto.replyToId,
        mentions: {
          create: named.map((userId) => ({
            userId,
            /* A reader is owed the difference between being asked and being
               one of thirty. */
            viaEveryone: !byName.has(userId.toLowerCase()),
          })),
        },
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, photoUrl: true },
        },
        replyTo: MessagingService.QUOTED,
        mentions: { select: { userId: true, viaEveryone: true } },
      },
    });

    /*
      What is left behind for anybody who was not looking.

      A toast is gone the moment it fades, so missing one used to mean losing
      the message. Everybody in the room gets an entry that survives; the
      people named get one that says so, and is never rolled up under a
      count.
    */
    /* Whoever watches over the chat reads it when they choose to, and is
       only called to it when somebody names them. */
    const watching = new Set([
      ...(conversation?.participants ?? [])
        .filter((p) => p.watching)
        .map((p) => p.userId),
      ...watchers,
    ]);
    await this.leaveNotifications(
      message,
      conversation,
      participantIds.filter((id) => !watching.has(id) || named.includes(id)),
      senderUserId,
      new Set(named),
    );

    return message;
  }

  /**
   * The trail a message leaves for people who were not looking at it.
   *
   * One entry per conversation, added to rather than duplicated: a person in
   * a busy class group would otherwise have two hundred entries by lunchtime,
   * and a bell nobody opens is a bell that notifies nobody.
   *
   * A mention is the exception and gets its own. Being named is directed at
   * you personally, and burying it under "12 new messages" is exactly how it
   * gets missed.
   */
  private async leaveNotifications(
    message: { id: string; content: string; sender: { firstName: string } },
    conversation: { id: string; type: string; name: string | null } | null,
    participantIds: string[],
    senderUserId: string,
    mentioned: Set<string>,
  ) {
    if (!conversation) return;
    /*
      Where the message came from, as a person would say it.

      A group carries its own name. A conversation between two people has
      none, and "Patrick messaged a conversation" is a sentence nobody would
      write - the answer there is who sent it, which the title already says,
      so the line becomes "Patrick messaged you".
    */
    const where = conversation.name?.trim() || null;
    const preview = plainText(message.content ?? '').slice(0, 120);

    await Promise.all(
      participantIds
        .filter((id) => id !== senderUserId)
        .map(async (userId) => {
          if (mentioned.has(userId)) {
            await this.prisma.notification.create({
              data: {
                userId,
                title: where
                  ? `${message.sender.firstName} mentioned you in ${where}`
                  : `${message.sender.firstName} mentioned you`,
                message: preview,
                /* The bell, not a push. This is written down and shown when
                   they next look; nothing is sent anywhere. Recording it as
                   PUSH made the row a claim that a message had been sent. */
                type: 'IN_APP',
                relatedEntityType: 'MENTION',
                relatedEntityId: conversation.id,
              },
            });
            return;
          }

          /* Rolled up. The unread entry for this conversation is added to;
             a read one is left alone and a new entry started, so opening
             the bell does not silently reset a running count. */
          const open = await this.prisma.notification.findFirst({
            where: {
              userId,
              isRead: false,
              relatedEntityType: 'MESSAGE',
              relatedEntityId: conversation.id,
            },
            select: { id: true, count: true },
          });

          if (open) {
            await this.prisma.notification.update({
              where: { id: open.id },
              data: {
                count: open.count + 1,
                title: where
                  ? `${open.count + 1} new messages in ${where}`
                  : `${open.count + 1} new messages from ${message.sender.firstName}`,
                message: preview,
              },
            });
            return;
          }

          await this.prisma.notification.create({
            data: {
              userId,
              title: where
                ? `${message.sender.firstName} messaged ${where}`
                : `${message.sender.firstName} messaged you`,
              message: preview,
              type: 'IN_APP',
              relatedEntityType: 'MESSAGE',
              relatedEntityId: conversation.id,
            },
          });
        }),
    );
  }

  async markAsRead(conversationId: string, userId: string) {
    const me = await this.ensureParticipant(conversationId, userId);

    const unreadMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderUserId: { not: userId },
        reads: { none: { userId } },
      },
      select: { id: true, senderUserId: true },
    });

    /*
      Opening the conversation clears what it left in the bell, and this
      happens before the early return below on purpose: a thread with nothing
      new in it can still have an entry waiting, because the messages may
      have been read on another device. A notification sitting there for
      something already read is a bell that cries wolf, and a bell that cries
      wolf is one people stop opening.

      Mentions clear with it. The point of a mention is to get somebody to
      the message, and they are now looking at it.
    */
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        relatedEntityType: { in: ['MESSAGE', 'MENTION'] },
        relatedEntityId: conversationId,
      },
      data: { isRead: true },
    });

    if (unreadMessages.length === 0) return { count: 0, readMessageIds: [] };

    await this.prisma.messageRead.createMany({
      data: unreadMessages.map((m) => ({
        messageId: m.id,
        userId,
      })),
      skipDuplicates: true,
    });

    /* Somebody watching over the chat having read it does not mean the
       person it was written to has: the sender is not told. */
    if (me.watching)
      return { count: unreadMessages.length, readMessageIds: [] };

    const readMessageIds = unreadMessages.map((m) => m.id);

    // Update message status to READ for messages where all participants have read
    // For simplicity: any read by a non-sender marks it as READ
    await this.prisma.message.updateMany({
      where: { id: { in: readMessageIds }, status: { not: 'READ' } },
      data: { status: 'READ' },
    });

    return { count: unreadMessages.length, readMessageIds };
  }

  /**
   * How much is waiting, split by how much it is addressed to you.
   *
   * Two numbers rather than one, because they are read differently: an unread
   * message in a class group of thirty is something to get to, and a mention
   * is somebody waiting on an answer. A single badge makes the second
   * invisible inside the first.
   */
  async unreadSummary(userId: string) {
    const [messages, mentions] = await Promise.all([
      this.prisma.message.count({
        where: {
          // A chat somebody only watches over is not waiting on them.
          conversation: {
            participants: { some: { userId, watching: false } },
          },
          senderUserId: { not: userId },
          reads: { none: { userId } },
        },
      }),
      this.prisma.messageMention.count({
        where: {
          userId,
          message: {
            reads: { none: { userId } },
            senderUserId: { not: userId },
          },
        },
      }),
    ]);
    return { unreadCount: messages, mentionCount: mentions };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        conversation: {
          participants: { some: { userId, watching: false } },
        },
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
  /**
   * Who a person may start a conversation with.
   *
   * Staff may reach anybody. A student may reach the staff, and their own
   * classmates - the people they already sit with all day. A parent reaches
   * the staff only: a school messaging tool that lets one parent look up
   * another parent's number is a different product.
   *
   * "Their class" rather than "every student in the school" is the line that
   * matters. Fourteen hundred children able to search each other by name is a
   * safeguarding problem, and it is not the thing being asked for - being
   * unable to message the person at the next desk is.
   */
  async getContacts(userId: string, search?: string) {
    const where = await this.reachableFrom(userId);
    if (!where) return { data: [] };

    if (search && search.trim()) {
      const q = search.trim();
      const matches = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
      where.AND = [...(where.AND ?? []), matches];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        photoUrl: true,
        // Picking the right Aline out of four is only possible with the
        // class beside the name.
        student: {
          select: {
            studentIdNumber: true,
            classSection: {
              select: {
                name: true,
                classLevel: { select: { name: true } },
                trade: { select: { code: true } },
              },
            },
          },
        },
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

  /**
   * Everyone this user shares a conversation with.
   *
   * Presence is only ever reported between people who share a conversation,
   * so this is the whole audience for one user's online state - and equally,
   * the only presence that user is entitled to be told about.
   */
  async getConversationPartnerIds(userId: string): Promise<string[]> {
    const convIds = await this.getUserConversationIds(userId);
    if (convIds.length === 0) return [];
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: { in: convIds }, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return participants.map((p) => p.userId);
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
    return participant;
  }

  // ─── NO CHILD ALONE IN A CHAT ─────────────────────────────────────────────
  //
  // A member of staff could open a private chat with any student and nobody
  // else could ever see it. Schools keep children safe with the same rule on
  // paper and in person: an adult is never alone with a child where nobody
  // can see. So every chat with a student and an adult in it also holds
  // somebody who watches over it - the school's safeguarding lead, or the
  // principal where the school has not named one.
  //
  // Not the student's parent. A child telling a teacher about trouble at home
  // has to be able to do it without that home reading along.
  //
  // A class group is the whole class with its teacher, and an announcement
  // cannot be answered, so neither is private and neither needs a watcher.

  /**
   * Who has to join a conversation so that no child in it is alone with an
   * adult, given who will be in it. Empty when nobody has to.
   */
  private async watchersNeeded(
    conversation: { type: string; classSectionId?: string | null },
    people: Present[],
  ): Promise<string[]> {
    if (conversation.type === 'BROADCAST' || conversation.classSectionId) {
      return [];
    }
    const here = people.filter((p) => p.user?.isActive);
    const aStudent = here.some((p) => p.user.role === Role.STUDENT);
    const anAdult = here.some(
      (p) => !p.watching && p.user.role !== Role.STUDENT,
    );
    if (!aStudent || !anAdult) return [];
    if (here.some((p) => p.watching)) return [];

    const present = new Set(people.map((p) => p.userId));
    const leads = await this.prisma.user.findMany({
      where: {
        safeguardingLead: true,
        isActive: true,
        role: { notIn: [Role.STUDENT, Role.PARENT] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const freeLeads = leads.map((l) => l.id).filter((id) => !present.has(id));
    // Every lead, when the school has a team of them: they share the work.
    if (freeLeads.length > 0) return freeLeads;

    // No lead free to watch: the principal, then the head teacher.
    const fallback = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.HEAD_TEACHER] }, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true },
    });
    const next = [
      ...fallback.filter((u) => u.role === Role.ADMIN),
      ...fallback.filter((u) => u.role === Role.HEAD_TEACHER),
    ].find((u) => !present.has(u.id));
    if (next) return [next.id];

    throw new BadRequestException(
      'Nobody at this school can watch over a chat with a student yet. Ask the principal to name a safeguarding lead.',
    );
  }

  /** People about to join a conversation, as `watchersNeeded` reads them. */
  private async newcomers(ids: string[]): Promise<Present[]> {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true, isActive: true },
    });
    return users.map((user) => ({ userId: user.id, watching: false, user }));
  }

  /**
   * The people a person may start a conversation with, as a filter on users.
   *
   * Staff may reach anybody. A student may reach the staff, and their own
   * classmates. A parent reaches the staff only.
   */
  private async reachableFrom(userId: string): Promise<any> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        student: { select: { classSectionId: true, status: true } },
      },
    });
    if (!me) return null;

    // Every role that works for the school. Derived from the enum rather than
    // listed, so a role added later is reachable the day it exists - the
    // hand-written version had already gone stale twice.
    const STUDENTS_AND_FAMILY: string[] = [Role.STUDENT, Role.PARENT];
    const STAFF = Object.values(Role).filter(
      (r) => !STUDENTS_AND_FAMILY.includes(r),
    );

    const where: any = { isActive: true, id: { not: userId } };
    if (STAFF.includes(me.role)) return where;

    const classmates =
      me.role === Role.STUDENT &&
      me.student?.status === 'ACTIVE' &&
      me.student.classSectionId
        ? {
            student: {
              classSectionId: me.student.classSectionId,
              status: 'ACTIVE' as const,
            },
          }
        : null;

    where.AND = [
      classmates
        ? { OR: [{ role: { in: STAFF } }, classmates] }
        : { role: { in: STAFF } },
    ];
    return where;
  }

  /** Refuse a conversation with anybody this person may not reach. */
  private async refuseUnreachable(userId: string, others: string[]) {
    const wanted = [...new Set(others)].filter((id) => id !== userId);
    if (wanted.length === 0) return;
    const reach = await this.reachableFrom(userId);
    const found = reach
      ? await this.prisma.user.count({
          where: { AND: [reach, { id: { in: wanted } }] },
        })
      : 0;
    if (found !== wanted.length) {
      throw new ForbiddenException(
        'You cannot start a conversation with somebody on that list',
      );
    }
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
        Role.BURSAR,
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
        type: 'IN_APP' as const,
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

    await this.refuseUnreachable(byUserId, userIds);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        classSectionId: true,
        participants: { select: PRESENT },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const existing = conversation.participants;
    const already = new Set(existing.map((p) => p.userId));
    const toAdd = [...new Set(userIds)].filter((id) => !already.has(id));

    if (toAdd.length === 0) return { added: 0 };

    // A student added to a room of adults brings somebody to watch over it.
    const watchers = await this.watchersNeeded(conversation, [
      ...existing,
      ...(await this.newcomers(toAdd)),
    ]);

    await this.prisma.conversationParticipant.createMany({
      data: [
        ...toAdd.map((userId) => ({ conversationId, userId })),
        ...watchers.map((userId) => ({
          conversationId,
          userId,
          watching: true,
        })),
      ],
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
      select: { isAdmin: true, watching: true },
    });
    if (leaving?.isAdmin && admins <= 1) {
      throw new BadRequestException(
        'Make somebody else an admin first, or the group is left with nobody to manage it',
      );
    }

    // The last person watching over a chat with a student stays in it.
    if (leaving?.watching) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          type: true,
          classSectionId: true,
          participants: { select: PRESENT },
        },
      });
      const staying = (conversation?.participants ?? []).filter(
        (p) => p.userId !== userId,
      );
      if (
        conversation &&
        (await this.watchersNeeded(conversation, staying)).length > 0
      ) {
        throw new BadRequestException(
          'A student is in this chat, so the person watching over it stays',
        );
      }
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

  /**
   * A payload that goes to everyone in a room at once, without the photo of
   * any student whose family said No to the app (B6). Replies to one person
   * are handled by the PhotoInterceptor, which knows who is asking.
   */
  async withoutKeptPhotos<T>(payload: T): Promise<T> {
    const hidden = await keptOutOfApp(this.prisma, peopleWithPhotos(payload));
    return withoutPhotos(payload, hidden);
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
