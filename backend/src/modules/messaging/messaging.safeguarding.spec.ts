import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * No child alone in a chat with an adult.
 *
 * A member of staff could open a private chat with any student, and nobody
 * else could ever see it. Every chat with a student and an adult in it now
 * holds somebody who watches over it: the school's safeguarding lead, or the
 * principal where none is named.
 */
type Person = {
  id: string;
  role: string;
  isActive?: boolean;
  safeguardingLead?: boolean;
  classSectionId?: string;
  createdAt?: number;
};

describe('MessagingService keeping children safe in chat', () => {
  let service: MessagingService;
  let people: Person[];

  const teacher = { id: 'teacher', role: 'TEACHER', createdAt: 3 };
  const student = {
    id: 'student',
    role: 'STUDENT',
    classSectionId: 's1a',
    createdAt: 4,
  };
  const classmate = {
    id: 'classmate',
    role: 'STUDENT',
    classSectionId: 's1a',
    createdAt: 5,
  };
  const parent = { id: 'parent', role: 'PARENT', createdAt: 6 };
  const principal = { id: 'principal', role: 'ADMIN', createdAt: 1 };
  const headTeacher = { id: 'dos', role: 'HEAD_TEACHER', createdAt: 2 };
  const lead = {
    id: 'lead',
    role: 'MATRON',
    safeguardingLead: true,
    createdAt: 7,
  };
  const secondLead = {
    id: 'lead2',
    role: 'PATRON',
    safeguardingLead: true,
    createdAt: 8,
  };

  const find = (id: string) => people.find((p) => p.id === id);
  const active = (p: Person) => p.isActive !== false;

  /* A small school the mocked database answers from, so each test reads as
     who works there rather than which call returns what. */
  const prisma: any = {
    user: {
      findUnique: jest.fn(({ where }) => {
        const p = find(where.id);
        return p
          ? {
              role: p.role,
              student: p.classSectionId
                ? { classSectionId: p.classSectionId, status: 'ACTIVE' }
                : null,
            }
          : null;
      }),
      count: jest.fn(({ where }) => {
        const [reach, { id }] = where.AND;
        return id.in.filter((target: string) => {
          const p = find(target);
          if (!p || !active(p) || p.id === reach.id.not) return false;
          if (!reach.AND) return true;
          const rule = reach.AND[0];
          const staffRoles: string[] = rule.OR
            ? rule.OR[0].role.in
            : rule.role.in;
          if (staffRoles.includes(p.role)) return true;
          const section = rule.OR?.[1]?.student?.classSectionId;
          return !!section && p.classSectionId === section;
        }).length;
      }),
      findMany: jest.fn(({ where }) => {
        let list = people.filter(active);
        if (where.id?.in) {
          return people
            .filter((p) => where.id.in.includes(p.id))
            .map((p) => ({ id: p.id, role: p.role, isActive: active(p) }));
        }
        if (where.safeguardingLead) {
          list = list.filter(
            (p) => p.safeguardingLead && !where.role.notIn.includes(p.role),
          );
        } else if (where.role?.in) {
          list = list.filter((p) => where.role.in.includes(p.role));
        }
        return list
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
          .map((p) => ({ id: p.id, role: p.role }));
      }),
    },
    conversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(({ data }) => ({ id: 'new', ...data })),
    },
    conversationParticipant: {
      findFirst: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
    },
    message: {
      create: jest.fn(({ data }) => ({
        id: 'm1',
        ...data,
        sender: { firstName: 'Aline' },
      })),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    messageRead: { createMany: jest.fn() },
    notification: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  /** The conversation as the service loads it, with who is in it. */
  const inRoom = (
    members: [Person, { watching?: boolean; isAdmin?: boolean }?][],
    extra: Record<string, unknown> = {},
  ) => ({
    id: 'c1',
    type: 'ONE_ON_ONE',
    name: null,
    createdByUserId: members[0][0].id,
    classSectionId: null,
    participants: members.map(([p, opts]) => ({
      userId: p.id,
      isAdmin: opts?.isAdmin ?? false,
      watching: opts?.watching ?? false,
      user: { role: p.role, isActive: active(p) },
    })),
    ...extra,
  });

  const created = () =>
    prisma.conversation.create.mock.calls[0][0].data.participants.create;

  beforeEach(async () => {
    jest.clearAllMocks();
    people = [
      teacher,
      student,
      classmate,
      parent,
      principal,
      headTeacher,
      lead,
    ];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  describe('starting a chat', () => {
    it('brings the safeguarding lead into a teacher’s chat with a student', async () => {
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'teacher',
      );
      expect(created()).toEqual([
        { userId: 'teacher', isAdmin: true },
        { userId: 'student', isAdmin: false },
        { userId: 'lead', watching: true },
      ]);
    });

    it('brings them in when the student starts it too', async () => {
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['teacher'] } as any,
        'student',
      );
      expect(created()).toContainEqual({ userId: 'lead', watching: true });
    });

    it('brings every lead when the school has a team of them', async () => {
      people.push(secondLead);
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'teacher',
      );
      const watchers = created().filter((p: any) => p.watching);
      expect(watchers.map((p: any) => p.userId)).toEqual(['lead', 'lead2']);
    });

    it('brings the principal where the school has named no lead', async () => {
      people = people.filter((p) => p !== lead);
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'teacher',
      );
      expect(created()).toContainEqual({ userId: 'principal', watching: true });
    });

    it('brings the head teacher when it is the principal talking to the student', async () => {
      people = people.filter((p) => p !== lead);
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'principal',
      );
      expect(created()).toContainEqual({ userId: 'dos', watching: true });
    });

    it('does not count the lead as watching their own chat with a student', async () => {
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'lead',
      );
      expect(created()).toContainEqual({ userId: 'principal', watching: true });
      expect(created()).not.toContainEqual({ userId: 'lead', watching: true });
    });

    it('skips a lead who has left the school', async () => {
      people = people.map((p) =>
        p === lead ? { ...lead, isActive: false } : p,
      );
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'teacher',
      );
      expect(created()).toContainEqual({ userId: 'principal', watching: true });
    });

    it('refuses when nobody at all could watch over it', async () => {
      people = [teacher, student];
      await expect(
        service.createConversation(
          { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
          'teacher',
        ),
      ).rejects.toThrow(/safeguarding lead/);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('leaves two adults to talk on their own', async () => {
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['teacher'] } as any,
        'principal',
      );
      expect(created().some((p: any) => p.watching)).toBe(false);
    });

    it('leaves two classmates to talk on their own', async () => {
      await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['classmate'] } as any,
        'student',
      );
      expect(created().some((p: any) => p.watching)).toBe(false);
    });

    it('watches over a group of staff and students too', async () => {
      await service.createConversation(
        {
          type: 'GROUP',
          name: 'Debate club',
          participantUserIds: ['student', 'classmate', 'principal'],
        } as any,
        'teacher',
      );
      expect(created()).toContainEqual({ userId: 'lead', watching: true });
    });

    it('finds the existing chat between the two, whoever is watching it', async () => {
      prisma.conversation.findFirst.mockResolvedValueOnce({ id: 'old' });
      const result = await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
        'teacher',
      );
      expect(result).toEqual({ id: 'old' });
      const where = prisma.conversation.findFirst.mock.calls[0][0].where;
      expect(where.participants).toEqual({
        none: { userId: { notIn: ['teacher', 'student'] }, watching: false },
      });
    });
  });

  describe('who may be reached', () => {
    it('refuses a parent opening a chat with somebody else’s child', async () => {
      await expect(
        service.createConversation(
          { type: 'ONE_ON_ONE', participantUserIds: ['student'] } as any,
          'parent',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('refuses a student opening a chat with a parent', async () => {
      await expect(
        service.createConversation(
          { type: 'ONE_ON_ONE', participantUserIds: ['parent'] } as any,
          'student',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses somebody who is not there at all', async () => {
      await expect(
        service.createConversation(
          { type: 'ONE_ON_ONE', participantUserIds: ['someone-else'] } as any,
          'teacher',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sending into a chat that already exists', () => {
    it('brings a watcher into an older chat that has none, before the message', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p' });
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([[teacher], [student]]),
      );
      await service.sendMessage(
        { conversationId: 'c1', content: 'See me after class' },
        'teacher',
      );
      expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith({
        data: [{ conversationId: 'c1', userId: 'lead', watching: true }],
        skipDuplicates: true,
      });
      const added =
        prisma.conversationParticipant.createMany.mock.invocationCallOrder[0];
      const stored = prisma.message.create.mock.invocationCallOrder[0];
      expect(added).toBeLessThan(stored);
    });

    it('adds nobody when somebody already watches', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p' });
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([[teacher], [student], [lead, { watching: true }]]),
      );
      await service.sendMessage(
        { conversationId: 'c1', content: 'Hello' },
        'teacher',
      );
      expect(prisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    });

    it('brings another when the one watching has left the school', async () => {
      people = people.map((p) =>
        p === lead ? { ...lead, isActive: false } : p,
      );
      prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p' });
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([
          [teacher],
          [student],
          [{ ...lead, isActive: false }, { watching: true }],
        ]),
      );
      await service.sendMessage(
        { conversationId: 'c1', content: 'Hello' },
        'teacher',
      );
      expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith({
        data: [{ conversationId: 'c1', userId: 'principal', watching: true }],
        skipDuplicates: true,
      });
    });

    it('does not call the watcher to every message', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p' });
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([[teacher], [student], [lead, { watching: true }]]),
      );
      await service.sendMessage(
        { conversationId: 'c1', content: 'Hello' },
        'teacher',
      );
      const told = prisma.notification.create.mock.calls.map(
        (c: any) => c[0].data.userId,
      );
      expect(told).toEqual(['student']);
    });

    it('leaves a class group alone: the whole class is in it', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p' });
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([[teacher], [student]], {
          type: 'GROUP',
          classSectionId: 's1a',
        }),
      );
      await service.sendMessage(
        { conversationId: 'c1', content: 'Homework is on page 4' },
        'teacher',
      );
      expect(prisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    });
  });

  describe('the people in it', () => {
    const asGroupAdmin = (room: any) => {
      prisma.conversation.findUnique.mockResolvedValue(room);
      prisma.conversationParticipant.findFirst.mockResolvedValue({
        isAdmin: true,
      });
    };

    it('brings a watcher when a student is added to a room of adults', async () => {
      asGroupAdmin(
        inRoom([[teacher, { isAdmin: true }], [principal]], { type: 'GROUP' }),
      );
      await service.addParticipants('c1', ['student'], 'teacher');
      expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith({
        data: [
          { conversationId: 'c1', userId: 'student' },
          { conversationId: 'c1', userId: 'lead', watching: true },
        ],
        skipDuplicates: true,
      });
    });

    it('will not let the group remove the one watching', async () => {
      asGroupAdmin(
        inRoom(
          [[teacher, { isAdmin: true }], [student], [lead, { watching: true }]],
          { type: 'GROUP' },
        ),
      );
      prisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ isAdmin: true })
        .mockResolvedValueOnce({ isAdmin: false, watching: true });
      await expect(
        service.removeParticipant('c1', 'lead', 'teacher'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.conversationParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('will not let the one watching walk out of a direct chat', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([[teacher], [student], [lead, { watching: true }]]),
      );
      prisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p' })
        .mockResolvedValueOnce({ isAdmin: false, watching: true });
      await expect(
        service.removeParticipant('c1', 'lead', 'lead'),
      ).rejects.toThrow(/watching over it stays/);
    });

    it('lets one of two watching leave', async () => {
      people.push(secondLead);
      prisma.conversation.findUnique.mockResolvedValue(
        inRoom([
          [teacher],
          [student],
          [lead, { watching: true }],
          [secondLead, { watching: true }],
        ]),
      );
      prisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p' })
        .mockResolvedValueOnce({ isAdmin: false, watching: true });
      await expect(
        service.removeParticipant('c1', 'lead', 'lead'),
      ).resolves.toEqual({ removed: true });
    });

    it('lets the teacher leave, and the watcher stay', async () => {
      prisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p' })
        .mockResolvedValueOnce({ isAdmin: false, watching: false });
      await expect(
        service.removeParticipant('c1', 'teacher', 'teacher'),
      ).resolves.toEqual({ removed: true });
    });
  });

  describe('what the one watching leaves behind', () => {
    it('records what they read without telling the sender it was read', async () => {
      prisma.conversationParticipant.findFirst.mockResolvedValue({
        id: 'p',
        watching: true,
      });
      prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);
      const result = await service.markAsRead('c1', 'lead');
      expect(prisma.messageRead.createMany).toHaveBeenCalled();
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ count: 1, readMessageIds: [] });
    });
  });
});
