import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MessagingService', () => {
  let service: MessagingService;

  const mockPrisma: any = {
    conversation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    conversationParticipant: { findFirst: jest.fn() },
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
    mockPrisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p1' });
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

      await service.sendMessage(
        { conversationId: 'c1', content: 'hi' } as any,
        'u1',
      );

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
        mockPrisma.conversation.create.mock.calls[0][0].data.participants.create;
      expect(created.map((p: any) => p.userId)).toEqual(['u1', 'u2', 'u3']);
      expect(created[0].isAdmin).toBe(true);
    });
  });
});
