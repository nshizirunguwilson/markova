import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MessagingService', () => {
  let service: MessagingService;

  const mockPrisma: any = {
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversationParticipant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    student: { findMany: jest.fn() },
    parentStudent: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    messageRead: { createMany: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
  };

  /** The caller is a participant of the conversation. */
  const asParticipant = () =>
    mockPrisma.conversationParticipant.findFirst.mockResolvedValue({
      id: 'p1',
    });
  /** The caller is an outsider. */
  const asOutsider = () =>
    mockPrisma.conversationParticipant.findFirst.mockResolvedValue(null);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<MessagingService>(MessagingService);
  });

  describe('participation guard', () => {
    it('refuses to read messages from a conversation the user is not in', async () => {
      asOutsider();
      await expect(service.getMessages('c1', 'intruder')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('refuses to post into a conversation the user is not in', async () => {
      asOutsider();
      await expect(
        service.sendMessage(
          { conversationId: 'c1', content: 'hello' } as any,
          'intruder',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('refuses to mark a conversation read for a non-participant', async () => {
      asOutsider();
      await expect(service.markAsRead('c1', 'intruder')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('sendMessage()', () => {
    it('takes the sender from the token, not the request body', async () => {
      asParticipant();
      mockPrisma.message.create.mockResolvedValue({});

      await service.sendMessage(
        {
          conversationId: 'c1',
          content: 'hi',
          senderUserId: 'someone-else',
        } as any,
        'real-user',
      );

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderUserId: 'real-user' }),
        }),
      );
    });

    it('defaults contentType to TEXT and status to SENT', async () => {
      asParticipant();
      mockPrisma.message.create.mockResolvedValue({});

      await service.sendMessage({ conversationId: 'c1', content: 'hi' }, 'u1');

      const data = mockPrisma.message.create.mock.calls[0][0].data;
      expect(data.contentType).toBe('TEXT');
      expect(data.status).toBe('SENT');
    });
  });

  describe('getMessages()', () => {
    it('pages backwards from the `before` cursor', async () => {
      asParticipant();
      mockPrisma.message.findMany.mockResolvedValue([]);

      await service.getMessages('c1', 'u1', 25, '2026-08-01T00:00:00.000Z');

      const args = mockPrisma.message.findMany.mock.calls[0][0];
      expect(args.take).toBe(25);
      expect(args.where.createdAt.lt).toEqual(
        new Date('2026-08-01T00:00:00.000Z'),
      );
    });
  });

  describe('markAsRead()', () => {
    it('is a no-op when there is nothing unread', async () => {
      asParticipant();
      mockPrisma.message.findMany.mockResolvedValue([]);

      await expect(service.markAsRead('c1', 'u1')).resolves.toEqual({
        count: 0,
        readMessageIds: [],
      });
      expect(mockPrisma.messageRead.createMany).not.toHaveBeenCalled();
    });

    it('never marks the user’s own messages as read by them', async () => {
      asParticipant();
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);
      mockPrisma.messageRead.createMany.mockResolvedValue({});
      mockPrisma.message.updateMany.mockResolvedValue({});

      await service.markAsRead('c1', 'u1');

      const where = mockPrisma.message.findMany.mock.calls[0][0].where;
      expect(where.senderUserId).toEqual({ not: 'u1' });
    });

    it('records the reads and promotes those messages to READ', async () => {
      asParticipant();
      mockPrisma.message.findMany.mockResolvedValue([
        { id: 'm1' },
        { id: 'm2' },
      ]);
      mockPrisma.messageRead.createMany.mockResolvedValue({});
      mockPrisma.message.updateMany.mockResolvedValue({});

      const result = await service.markAsRead('c1', 'u1');

      expect(result).toEqual({ count: 2, readMessageIds: ['m1', 'm2'] });
      expect(mockPrisma.messageRead.createMany).toHaveBeenCalledWith({
        data: [
          { messageId: 'm1', userId: 'u1' },
          { messageId: 'm2', userId: 'u1' },
        ],
        skipDuplicates: true,
      });
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1', 'm2'] }, status: { not: 'READ' } },
        data: { status: 'READ' },
      });
    });
  });

  describe('getUnreadCount()', () => {
    it('counts only other people’s unread messages in the user’s conversations', async () => {
      mockPrisma.message.count.mockResolvedValue(4);

      await expect(service.getUnreadCount('u1')).resolves.toEqual({
        unreadCount: 4,
      });

      const where = mockPrisma.message.count.mock.calls[0][0].where;
      expect(where.senderUserId).toEqual({ not: 'u1' });
      expect(where.reads).toEqual({ none: { userId: 'u1' } });
      expect(where.conversation).toEqual({
        participants: { some: { userId: 'u1' } },
      });
    });
  });

  describe('createConversation()', () => {
    it('reuses the existing one-on-one thread instead of creating a duplicate', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.createConversation(
        { type: 'ONE_ON_ONE', participantUserIds: ['u2'] } as any,
        'u1',
      );

      expect(result).toEqual({ id: 'existing' });
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('always includes the creator, and only once', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({});

      await service.createConversation(
        { type: 'GROUP', participantUserIds: ['u1', 'u2', 'u3'] } as any,
        'u1',
      );

      const created =
        mockPrisma.conversation.create.mock.calls[0][0].data.participants
          .create;
      expect(created.map((p: any) => p.userId)).toEqual(['u1', 'u2', 'u3']);
      expect(created[0].isAdmin).toBe(true);
    });
  });

  /**
   * "Everyone in Senior 1's family needs to know by Friday" is the single most
   * common thing a school has to say, and the only tool for it today is a
   * photocopied letter handed to a child.
   */
  describe('announcements', () => {
    const announcement = {
      audience: 'ALL_PARENTS' as any,
      title: 'School closes early on Friday',
      message: 'Buses leave at midday. Please collect day students by 12:30.',
    };

    beforeEach(() => {
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        messages: [{ id: 'msg-1' }],
      });
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
    });

    it('reaches every active parent', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]);

      const result = await service.broadcast(announcement, 'admin-1');
      expect(result.recipients).toBe(3);
    });

    // An inactive account cannot read it, and counting them makes the number
    // the sender sees a lie.
    it('leaves inactive accounts out', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'p1' }]);
      await service.broadcast(announcement, 'admin-1');
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.isActive).toBe(
        true,
      );
    });

    // A parent with two children in the same year is one recipient, not two.
    it('counts a parent of two children once', async () => {
      mockPrisma.parentStudent.findMany.mockResolvedValue([
        { parentUserId: 'p1' },
        { parentUserId: 'p1' },
        { parentUserId: 'p2' },
      ]);

      const result = await service.broadcast(
        {
          ...announcement,
          audience: 'PARENTS_OF_LEVELS' as any,
          classLevelIds: ['level-1'],
        },
        'admin-1',
      );
      expect(result.recipients).toBe(2);
    });

    // A graduate's parents do not need the Senior 1 trip letter.
    it('reaches only families of students still on the roll', async () => {
      mockPrisma.parentStudent.findMany.mockResolvedValue([]);
      await expect(
        service.broadcast(
          {
            ...announcement,
            audience: 'PARENTS_OF_CLASSES' as any,
            classSectionIds: ['section-1'],
          },
          'admin-1',
        ),
      ).rejects.toThrow(/nobody to tell/i);

      expect(
        mockPrisma.parentStudent.findMany.mock.calls[0][0].where.student.status,
      ).toBe('ACTIVE');
    });

    it('refuses a level audience with no levels chosen', async () => {
      await expect(
        service.broadcast(
          { ...announcement, audience: 'PARENTS_OF_LEVELS' as any },
          'admin-1',
        ),
      ).rejects.toThrow(/at least one year level/i);
    });

    it('refuses a class audience with no classes chosen', async () => {
      await expect(
        service.broadcast(
          { ...announcement, audience: 'STUDENTS_OF_CLASSES' as any },
          'admin-1',
        ),
      ).rejects.toThrow(/at least one class/i);
    });

    it('does not send to nobody', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await expect(service.broadcast(announcement, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('does not send the sender their own announcement', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'p1' },
      ]);
      const result = await service.broadcast(announcement, 'admin-1');
      expect(result.recipientIds).toEqual(['p1']);
    });

    // The bell as well as the letter. A conversation nobody opens is a
    // conversation nobody read.
    it('rings everybody as well as writing to them', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      await service.broadcast(announcement, 'admin-1');
      expect(mockPrisma.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
    });

    // Nobody should find out they addressed four hundred families by doing it.
    it('says how many it would reach before it is sent', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const result = await service.previewAudience({
        audience: 'ALL_PARENTS' as any,
      });
      expect(result).toEqual({ count: 2 });
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    /**
     * An announcement is not a thread. If four hundred parents could reply
     * into it, the first reply would reach all four hundred, and the feature
     * would be switched off within a week.
     */
    it('refuses a reply from a recipient', async () => {
      asParticipant();
      mockPrisma.conversation.findUnique.mockResolvedValue({
        type: 'BROADCAST',
        createdByUserId: 'admin-1',
      });

      await expect(
        service.sendMessage(
          { conversationId: 'conv-1', content: 'Can I collect at 1?' },
          'parent-1',
        ),
      ).rejects.toThrow(/message the school directly/i);
    });

    it('lets the school follow up in its own announcement', async () => {
      asParticipant();
      mockPrisma.conversation.findUnique.mockResolvedValue({
        type: 'BROADCAST',
        createdByUserId: 'admin-1',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-2' });

      await expect(
        service.sendMessage(
          { conversationId: 'conv-1', content: 'Correction: 12:45.' },
          'admin-1',
        ),
      ).resolves.toBeDefined();
    });

    it('leaves an ordinary group conversation alone', async () => {
      asParticipant();
      mockPrisma.conversation.findUnique.mockResolvedValue({
        type: 'GROUP',
        createdByUserId: 'somebody-else',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-2' });

      await expect(
        service.sendMessage(
          { conversationId: 'conv-1', content: 'Morning all' },
          'teacher-1',
        ),
      ).resolves.toBeDefined();
    });
  });

  /**
   * A group anybody can add to is a group that leaks: a parent added to the
   * staff room sees everything said in it.
   */
  describe('group membership', () => {
    const asGroupAdmin = () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'GROUP' });
      mockPrisma.conversationParticipant.findFirst.mockResolvedValue({
        isAdmin: true,
      });
    };
    const asPlainMember = () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'GROUP' });
      mockPrisma.conversationParticipant.findFirst.mockResolvedValue({
        isAdmin: false,
      });
    };

    it('adds people a group admin names', async () => {
      asGroupAdmin();
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { userId: 'u1' },
      ]);
      mockPrisma.conversationParticipant.createMany.mockResolvedValue({
        count: 2,
      });

      const result = await service.addParticipants(
        'conv-1',
        ['u2', 'u3'],
        'u1',
      );
      expect(result.added).toBe(2);
    });

    it('refuses a plain member adding somebody', async () => {
      asPlainMember();
      await expect(
        service.addParticipants('conv-1', ['u2'], 'u9'),
      ).rejects.toThrow(/only a group admin/i);
    });

    it('refuses an outsider entirely', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ type: 'GROUP' });
      mockPrisma.conversationParticipant.findFirst.mockResolvedValue(null);
      await expect(
        service.addParticipants('conv-1', ['u2'], 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not add somebody already in the group twice', async () => {
      asGroupAdmin();
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);

      const result = await service.addParticipants('conv-1', ['u2'], 'u1');
      expect(result.added).toBe(0);
      expect(
        mockPrisma.conversationParticipant.createMany,
      ).not.toHaveBeenCalled();
    });

    it('has nothing to manage on a one to one conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        type: 'ONE_ON_ONE',
      });
      await expect(
        service.addParticipants('conv-1', ['u2'], 'u1'),
      ).rejects.toThrow(/no membership to manage/i);
    });

    it('refuses a conversation that does not exist', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.addParticipants('nope', ['u2'], 'u1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets anybody leave on their own', async () => {
      mockPrisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({ isAdmin: false });
      mockPrisma.conversationParticipant.count.mockResolvedValue(1);
      mockPrisma.conversationParticipant.deleteMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.removeParticipant('conv-1', 'u2', 'u2'),
      ).resolves.toEqual({ removed: true });
    });

    it('refuses a plain member removing somebody else', async () => {
      asPlainMember();
      await expect(
        service.removeParticipant('conv-1', 'u3', 'u2'),
      ).rejects.toThrow(/only a group admin/i);
    });

    // A group whose last admin walks out is a group nobody can manage again.
    it('will not let the last admin leave', async () => {
      mockPrisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({ isAdmin: true });
      mockPrisma.conversationParticipant.count.mockResolvedValue(1);

      await expect(
        service.removeParticipant('conv-1', 'u1', 'u1'),
      ).rejects.toThrow(/make somebody else an admin first/i);
      expect(
        mockPrisma.conversationParticipant.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it('lets an admin leave when another one remains', async () => {
      mockPrisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({ isAdmin: true });
      mockPrisma.conversationParticipant.count.mockResolvedValue(2);
      mockPrisma.conversationParticipant.deleteMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.removeParticipant('conv-1', 'u1', 'u1'),
      ).resolves.toEqual({ removed: true });
    });

    // A group's history is a record of what was said. Rewriting it when a
    // person leaves makes it useless.
    it('leaves the messages a departing member sent', async () => {
      mockPrisma.conversationParticipant.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({ isAdmin: false });
      mockPrisma.conversationParticipant.count.mockResolvedValue(1);
      mockPrisma.conversationParticipant.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.removeParticipant('conv-1', 'u2', 'u2');
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('renames a group for its admin', async () => {
      asGroupAdmin();
      mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });
      await service.renameConversation('conv-1', 'Senior 1 class teachers', 'u1');
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Senior 1 class teachers' },
        }),
      );
    });

    it('refuses a rename from a plain member', async () => {
      asPlainMember();
      await expect(
        service.renameConversation('conv-1', 'Anything', 'u2'),
      ).rejects.toThrow(/only a group admin/i);
    });

    it('shows the membership to anybody in the conversation', async () => {
      asParticipant();
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([]);
      await expect(service.getParticipants('conv-1', 'u1')).resolves.toEqual([]);
    });

    it('shows the membership to nobody outside it', async () => {
      asOutsider();
      await expect(
        service.getParticipants('conv-1', 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});