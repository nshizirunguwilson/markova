import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
      update: jest.fn(),
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
      expect(
        mockPrisma.notification.createMany.mock.calls[0][0].data,
      ).toHaveLength(2);
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
      await service.renameConversation(
        'conv-1',
        'Senior 1 class teachers',
        'u1',
      );
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
      await expect(service.getParticipants('conv-1', 'u1')).resolves.toEqual(
        [],
      );
    });

    it('shows the membership to nobody outside it', async () => {
      asOutsider();
      await expect(
        service.getParticipants('conv-1', 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * The conversation list, which is the first thing anybody sees. It has to
   * open on whoever wrote last, because that is the thread they came for.
   */
  describe('the conversation list', () => {
    const conv = (id: string, created: string, last?: string) => ({
      id,
      createdAt: new Date(created),
      participants: [],
      messages: last ? [{ id: `m-${id}`, createdAt: new Date(last) }] : [],
    });

    beforeEach(() => mockPrisma.message.count.mockResolvedValue(0));

    it('reads only the conversations this person is in', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);
      await service.getConversations('user-1');
      expect(mockPrisma.conversation.findMany.mock.calls[0][0].where).toEqual({
        participants: { some: { userId: 'user-1' } },
      });
    });

    it('puts the most recently active thread first', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        conv('c-1', '2026-01-01', '2026-08-01'),
        conv('c-2', '2026-01-01', '2026-08-20'),
      ]);
      const result = await service.getConversations('user-1');
      expect(result.map((c: any) => c.id)).toEqual(['c-2', 'c-1']);
    });

    // A conversation somebody just started has no messages yet, and it should
    // not sink to the bottom of the list.
    it('orders an empty thread by when it was started', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        conv('c-1', '2026-01-01', '2026-08-01'),
        conv('c-2', '2026-08-24'),
      ]);
      const result = await service.getConversations('user-1');
      expect(result[0].id).toBe('c-2');
    });

    it('flattens the last message onto each thread', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        conv('c-1', '2026-01-01', '2026-08-01'),
      ]);
      const result = await service.getConversations('user-1');
      expect(result[0].lastMessage).toMatchObject({ id: 'm-c-1' });
      expect(result[0].messages).toBeUndefined();
    });

    /**
     * The unread badge counts what somebody else sent and this person has
     * not opened. Counting their own would badge every thread they wrote in.
     */
    it('counts only what somebody else sent and they have not read', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        conv('c-1', '2026-01-01'),
      ]);
      mockPrisma.message.count.mockResolvedValue(3);
      const result = await service.getConversations('user-1');
      expect(result[0].unreadCount).toBe(3);
      expect(mockPrisma.message.count.mock.calls[0][0].where).toEqual({
        conversationId: 'c-1',
        senderUserId: { not: 'user-1' },
        reads: { none: { userId: 'user-1' } },
      });
    });
  });

  describe('reading a thread', () => {
    beforeEach(() => {
      asParticipant();
      mockPrisma.message.findMany.mockResolvedValue([]);
    });

    it('reads newest first, because a chat opens at the bottom', async () => {
      await service.getMessages('c-1', 'user-1');
      expect(mockPrisma.message.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('reads fifty unless told otherwise', async () => {
      await service.getMessages('c-1', 'user-1');
      expect(mockPrisma.message.findMany.mock.calls[0][0].take).toBe(50);
    });

    // Scrolling up asks for what came before a message already on screen.
    it('reads only what came before a given point', async () => {
      await service.getMessages('c-1', 'user-1', 20, '2026-08-20T10:00:00Z');
      const where = mockPrisma.message.findMany.mock.calls[0][0].where;
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      expect(mockPrisma.message.findMany.mock.calls[0][0].take).toBe(20);
    });
  });

  /**
   * Who a person may write to. A student messaging another student's parent
   * is not something a school wants to have to explain.
   */
  describe('who somebody may write to', () => {
    beforeEach(() => mockPrisma.user.findMany.mockResolvedValue([]));

    it('answers with nobody for an account that does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getContacts('nobody')).resolves.toEqual({
        data: [],
      });
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    /** The `where` the roll was actually queried with. */
    const askedFor = () => mockPrisma.user.findMany.mock.calls[0][0].where;

    it('holds a PARENT to the staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'PARENT' });
      await service.getContacts('user-1');
      const clause = askedFor().AND[0];
      expect(clause.role.in).toContain('ADMIN');
      expect(clause.role.in).not.toContain('STUDENT');
      expect(clause.role.in).not.toContain('PARENT');
    });

    /**
     * The staff list used to be written out by hand, and had already gone
     * stale twice: a student could not message the nurse or the matron
     * because nobody revisited it when those roles were added.
     */
    it('counts every role that works for the school as staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'PARENT' });
      await service.getContacts('user-1');
      const staff = askedFor().AND[0].role.in;
      for (const role of ['ADMIN', 'TEACHER', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE']) {
        expect(staff).toContain(role);
      }
    });

    /**
     * Being unable to message the person at the next desk is the complaint.
     * Being able to search fourteen hundred children by name is a different
     * problem, so a student reaches their own class and the staff.
     */
    it('lets a student reach their classmates as well as the staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'STUDENT',
        student: { classSectionId: 'section-1', status: 'ACTIVE' },
      });
      await service.getContacts('user-1');
      const [staffOrClassmates] = askedFor().AND[0].OR;
      expect(staffOrClassmates.role.in).toContain('TEACHER');
      expect(askedFor().AND[0].OR[1]).toEqual({
        student: { classSectionId: 'section-1', status: 'ACTIVE' },
      });
    });

    it('holds a student with no class to the staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'STUDENT',
        student: { classSectionId: null, status: 'ACTIVE' },
      });
      await service.getContacts('user-1');
      expect(askedFor().AND[0]).not.toHaveProperty('OR');
    });

    // A student who has left keeps no reach into the class they left.
    it('holds a student who has left to the staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'STUDENT',
        student: { classSectionId: 'section-1', status: 'TRANSFERRED' },
      });
      await service.getContacts('user-1');
      expect(askedFor().AND[0]).not.toHaveProperty('OR');
    });

    it.each(['ADMIN', 'TEACHER', 'LIBRARIAN', 'NURSE', 'MATRON'])(
      'lets a %s write to anybody',
      async (role) => {
        mockPrisma.user.findUnique.mockResolvedValue({ role });
        await service.getContacts('user-1');
        expect(askedFor()).not.toHaveProperty('AND');
      },
    );

    it('leaves the person themselves out of their own list', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await service.getContacts('user-1');
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.id).toEqual({
        not: 'user-1',
      });
    });

    it('leaves out accounts that have been retired', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await service.getContacts('user-1');
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.isActive).toBe(
        true,
      );
    });

    it('searches the name and the address', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await service.getContacts('user-1', 'Aline');
      // The search is one clause among the rules, not a replacement for them:
      // narrowing by name must never widen who is reachable.
      const asked = JSON.stringify(askedFor().AND);
      expect(asked).toContain('firstName');
      expect(asked).toContain('email');
    });

    it('keeps a student inside their class while searching', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'STUDENT',
        student: { classSectionId: 'section-1', status: 'ACTIVE' },
      });
      await service.getContacts('user-1', 'Aline');
      const [rules, search] = askedFor().AND;
      expect(rules).toHaveProperty('OR');
      expect(JSON.stringify(search)).toContain('firstName');
    });

    it('ignores a search of nothing but spaces', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await service.getContacts('user-1', '   ');
      expect(
        mockPrisma.user.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('OR');
    });

    // A picker is for picking from, not for scrolling through a whole school.
    it('offers at most thirty names', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await service.getContacts('user-1');
      expect(mockPrisma.user.findMany.mock.calls[0][0].take).toBe(30);
    });
  });

  /**
   * Delivery ticks. The second tick means a device has the message, which is
   * only true for messages sent to this person by somebody else.
   */
  describe('marking messages delivered', () => {
    it('takes only what was sent to this person and not yet delivered', async () => {
      mockPrisma.message.findMany.mockResolvedValue([]);
      await service.markDelivered('user-1');
      expect(mockPrisma.message.findMany.mock.calls[0][0].where).toEqual({
        status: 'SENT',
        senderUserId: { not: 'user-1' },
        conversation: { participants: { some: { userId: 'user-1' } } },
      });
    });

    it('writes nothing when there was nothing waiting', async () => {
      mockPrisma.message.findMany.mockResolvedValue([]);
      const result = await service.markDelivered('user-1');
      expect(result).toEqual([]);
      expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('moves them all in one write and hands back who to tell', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: 'm-1', senderUserId: 'user-9', conversationId: 'c-1' },
        { id: 'm-2', senderUserId: 'user-9', conversationId: 'c-1' },
      ]);
      const result = await service.markDelivered('user-1');
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m-1', 'm-2'] } },
        data: { status: 'DELIVERED' },
      });
      expect(result).toHaveLength(2);
    });

    it('moves one message to a given status', async () => {
      mockPrisma.message.update.mockResolvedValue({});
      await service.updateMessageStatus('m-1', 'READ');
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { status: 'READ' },
      });
    });
  });

  describe('the rooms a socket belongs to', () => {
    it('lists the conversations a person is in', async () => {
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { conversationId: 'c-1' },
        { conversationId: 'c-2' },
      ]);
      await expect(service.getUserConversationIds('user-1')).resolves.toEqual([
        'c-1',
        'c-2',
      ]);
    });

    it('lists everyone a person shares a conversation with', async () => {
      mockPrisma.conversationParticipant.findMany
        .mockResolvedValueOnce([{ conversationId: 'c-1' }])
        .mockResolvedValueOnce([{ userId: 'user-2' }, { userId: 'user-3' }]);

      await expect(
        service.getConversationPartnerIds('user-1'),
      ).resolves.toEqual(['user-2', 'user-3']);

      expect(mockPrisma.conversationParticipant.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { conversationId: { in: ['c-1'] }, userId: { not: 'user-1' } },
          distinct: ['userId'],
        }),
      );
    });

    it('finds nobody for a person in no conversation at all', async () => {
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([]);
      await expect(service.getConversationPartnerIds('user-1')).resolves.toEqual(
        [],
      );
      // The second query is skipped rather than run with an empty `in`.
      expect(mockPrisma.conversationParticipant.findMany).toHaveBeenCalledTimes(1);
    });

    it('lists who is in a conversation', async () => {
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      await expect(
        service.getConversationParticipantIds('c-1'),
      ).resolves.toEqual(['user-1', 'user-2']);
    });
  });

  /**
   * The student audiences for an announcement, which resolve to the students
   * themselves rather than through their families.
   */
  describe('announcing to students rather than families', () => {
    beforeEach(() => {
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        messages: [{ id: 'msg-1' }],
      });
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
    });

    it.each([
      ['STUDENTS_OF_LEVELS', { classLevelIds: ['level-1'] }],
      ['STUDENTS_OF_CLASSES', { classSectionIds: ['section-1'] }],
    ])('reaches the students of %s directly', async (audience, scope) => {
      mockPrisma.student.findMany.mockResolvedValue([
        { userId: 'u-1' },
        { userId: 'u-2' },
      ]);
      const result = await service.broadcast(
        { audience, title: 'X', message: 'Y', ...scope } as never,
        'admin-1',
      );
      expect(result.recipients).toBe(2);
      expect(mockPrisma.parentStudent.findMany).not.toHaveBeenCalled();
    });

    it('leaves out students whose account has been retired', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      await expect(
        service.broadcast(
          {
            audience: 'STUDENTS_OF_LEVELS',
            title: 'X',
            message: 'Y',
            classLevelIds: ['level-1'],
          } as never,
          'admin-1',
        ),
      ).rejects.toThrow(/nobody to tell/i);
      expect(mockPrisma.student.findMany.mock.calls[0][0].where.user).toEqual({
        isActive: true,
      });
    });

    // A student in two classes would otherwise be counted twice.
    it('counts a student once however many times they matched', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { userId: 'u-1' },
        { userId: 'u-1' },
      ]);
      const result = await service.broadcast(
        {
          audience: 'STUDENTS_OF_CLASSES',
          title: 'X',
          message: 'Y',
          classSectionIds: ['section-1'],
        } as never,
        'admin-1',
      );
      expect(result.recipients).toBe(1);
    });
  });
});

/**
 * The group a class already has.
 *
 * Not something a teacher has to remember to create, and not something that
 * goes stale: a student who joined the class last week belongs in it, and one
 * who has left does not. Reconciling on read means it is right whenever
 * somebody looks, without a nightly job for anyone to forget to run.
 */
describe('MessagingService and the class group', () => {
  /** Only the models the class group touches. */
  const build = () => ({
    classSection: { findUnique: jest.fn() },
    student: { findMany: jest.fn() },
    teacherRole: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    conversation: { create: jest.fn(), update: jest.fn() },
    conversationParticipant: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  });

  let mockPrisma: ReturnType<typeof build>;
  let service: MessagingService;

  const section = {
    id: 'section-1',
    name: 'A',
    classLevel: { name: 'Senior 2' },
    trade: null,
    groupChat: null as { id: string; name: string } | null,
  };

  beforeEach(() => {
    mockPrisma = build();
    service = new MessagingService(mockPrisma as never);
    mockPrisma.classSection.findUnique.mockResolvedValue(section);
    mockPrisma.student.findMany.mockResolvedValue([
      { userId: 'u-student-1' },
      { userId: 'u-student-2' },
    ]);
    mockPrisma.teacherRole.findFirst.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-admin' });
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([]);
  });

  it('creates the group with the class in it', async () => {
    await service.ensureClassGroup('section-1');

    const data = mockPrisma.conversation.create.mock.calls[0][0].data;
    expect(data.type).toBe('GROUP');
    expect(data.classSectionId).toBe('section-1');
    expect(data.participants.create.map((p: { userId: string }) => p.userId)).toEqual(
      expect.arrayContaining(['u-student-1', 'u-student-2']),
    );
  });

  it('names it after the class, as the school says it', async () => {
    await service.ensureClassGroup('section-1');
    expect(mockPrisma.conversation.create.mock.calls[0][0].data.name).toBe(
      'Senior 2 A',
    );
  });

  it('names a trade class by its trade', async () => {
    mockPrisma.classSection.findUnique.mockResolvedValue({
      ...section,
      classLevel: { name: 'Level 4' },
      trade: { code: 'SWD' },
      name: 'B',
    });
    await service.ensureClassGroup('section-1');
    expect(mockPrisma.conversation.create.mock.calls[0][0].data.name).toBe(
      'Level 4 SWD B',
    );
  });

  /**
   * A room of thirty children with an adult responsible for it. The class
   * teacher where there is one; the administrator where there is not,
   * because a class group with no adult in it is not a room a school would
   * allow.
   */
  it('puts the class teacher in it', async () => {
    mockPrisma.teacherRole.findFirst.mockResolvedValue({
      teacher: { userId: 'u-teacher' },
    });
    await service.ensureClassGroup('section-1');
    const members = mockPrisma.conversation.create.mock.calls[0][0].data.participants.create.map(
      (p: { userId: string }) => p.userId,
    );
    expect(members).toContain('u-teacher');
    expect(members).not.toContain('u-admin');
  });

  it('falls to the administrator when the class has no teacher', async () => {
    await service.ensureClassGroup('section-1');
    const members = mockPrisma.conversation.create.mock.calls[0][0].data.participants.create.map(
      (p: { userId: string }) => p.userId,
    );
    expect(members).toContain('u-admin');
  });

  it('asks only for students who are still in the class', async () => {
    await service.ensureClassGroup('section-1');
    expect(mockPrisma.student.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ classSectionId: 'section-1', status: 'ACTIVE' }),
    );
  });

  it('makes only one group, however often it is asked', async () => {
    mockPrisma.classSection.findUnique.mockResolvedValue({
      ...section,
      groupChat: { id: 'conv-1', name: 'Senior 2 A' },
    });
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([
      { userId: 'u-student-1' },
      { userId: 'u-student-2' },
      { userId: 'u-admin' },
    ]);

    const id = await service.ensureClassGroup('section-1');

    expect(id).toBe('conv-1');
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    expect(mockPrisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.conversationParticipant.deleteMany).not.toHaveBeenCalled();
  });

  it('adds a student who has since joined the class', async () => {
    mockPrisma.classSection.findUnique.mockResolvedValue({
      ...section,
      groupChat: { id: 'conv-1', name: 'Senior 2 A' },
    });
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([
      { userId: 'u-student-1' },
      { userId: 'u-admin' },
    ]);

    await service.ensureClassGroup('section-1');

    expect(mockPrisma.conversationParticipant.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ conversationId: 'conv-1', userId: 'u-student-2' }],
      }),
    );
  });

  // A child who has left the class does not keep reading it.
  it('takes out somebody who has left the class', async () => {
    mockPrisma.classSection.findUnique.mockResolvedValue({
      ...section,
      groupChat: { id: 'conv-1', name: 'Senior 2 A' },
    });
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([
      { userId: 'u-student-1' },
      { userId: 'u-student-2' },
      { userId: 'u-admin' },
      { userId: 'u-left' },
    ]);

    await service.ensureClassGroup('section-1');

    expect(mockPrisma.conversationParticipant.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', userId: { in: ['u-left'] } },
    });
  });

  it('renames the group when the class is renamed', async () => {
    mockPrisma.classSection.findUnique.mockResolvedValue({
      ...section,
      groupChat: { id: 'conv-1', name: 'Senior 1 A' },
    });
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([
      { userId: 'u-student-1' },
      { userId: 'u-student-2' },
      { userId: 'u-admin' },
    ]);

    await service.ensureClassGroup('section-1');

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { name: 'Senior 2 A' },
    });
  });

  it('makes nothing for a class that does not exist', async () => {
    mockPrisma.classSection.findUnique.mockResolvedValue(null);
    await expect(service.ensureClassGroup('nope')).resolves.toBeNull();
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  // An empty class with nobody to answer for it is not a room.
  it('makes nothing for a class with nobody in it at all', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(service.ensureClassGroup('section-1')).resolves.toBeNull();
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });
});

/**
 * The class group turning up on its own.
 *
 * "By default" means nobody creates it and nobody is invited to it. It is
 * made sure of when a person's conversations are listed, which is the moment
 * they would notice it missing.
 */
describe('MessagingService listing a class group into existence', () => {
  const build = () => ({
    user: { findUnique: jest.fn() },
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
    message: { findFirst: jest.fn().mockResolvedValue(null) },
    conversationParticipant: { count: jest.fn().mockResolvedValue(0) },
  });

  let mockPrisma: ReturnType<typeof build>;
  let service: MessagingService;
  let ensure: jest.SpyInstance;

  beforeEach(() => {
    mockPrisma = build();
    service = new MessagingService(mockPrisma as never);
    ensure = jest
      .spyOn(service, 'ensureClassGroup')
      .mockResolvedValue('conv-class');
  });

  it("makes sure of a student's own class", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'STUDENT',
      student: { classSectionId: 'section-1', status: 'ACTIVE' },
      teacher: null,
    });

    await service.getConversations('u-1');

    expect(ensure).toHaveBeenCalledWith('section-1');
  });

  it('makes sure of every class a class teacher answers for', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'TEACHER',
      student: null,
      teacher: {
        roles: [{ classSectionId: 'section-1' }, { classSectionId: 'section-2' }],
      },
    });

    await service.getConversations('u-1');

    expect(ensure).toHaveBeenCalledWith('section-1');
    expect(ensure).toHaveBeenCalledWith('section-2');
  });

  it('asks once for a class named twice', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'TEACHER',
      student: null,
      teacher: {
        roles: [{ classSectionId: 'section-1' }, { classSectionId: 'section-1' }],
      },
    });

    await service.getConversations('u-1');

    expect(ensure).toHaveBeenCalledTimes(1);
  });

  // A parent, a librarian, a nurse: no class of their own, and no cost.
  it('does nothing for somebody with no class', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'PARENT',
      student: null,
      teacher: null,
    });

    await service.getConversations('u-1');

    expect(ensure).not.toHaveBeenCalled();
  });

  it('does nothing for a student who has left', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'STUDENT',
      student: { classSectionId: 'section-1', status: 'GRADUATED' },
      teacher: null,
    });

    await service.getConversations('u-1');

    expect(ensure).not.toHaveBeenCalled();
  });

  it('still lists conversations for an account that has gone', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getConversations('nobody')).resolves.toEqual([]);
    expect(ensure).not.toHaveBeenCalled();
  });
});
