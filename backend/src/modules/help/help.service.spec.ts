import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HelpService } from './help.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HelpService', () => {
  let service: HelpService;

  const mockPrisma: any = {
    faqArticle: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    supportTicket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<HelpService>(HelpService);
  });

  describe('findAllFaqs()', () => {
    it('only ever returns published articles to non-admins', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqs();
      expect(mockPrisma.faqArticle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isPublished: true } }),
      );
    });

    it('searches title and content case-insensitively, still published-only', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqs('attendance');

      const where = mockPrisma.faqArticle.findMany.mock.calls[0][0].where;
      expect(where.isPublished).toBe(true);
      expect(where.OR).toEqual([
        { title: { contains: 'attendance', mode: 'insensitive' } },
        { content: { contains: 'attendance', mode: 'insensitive' } },
      ]);
    });
  });

  describe('findAllFaqsAdmin()', () => {
    it('returns drafts as well as published articles', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqsAdmin();
      expect(mockPrisma.faqArticle.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ where: expect.anything() }),
      );
    });
  });

  describe('updateFaq()', () => {
    it('throws when the article is missing', async () => {
      mockPrisma.faqArticle.findUnique.mockResolvedValue(null);
      await expect(service.updateFaq('x', {} as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.faqArticle.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteFaq()', () => {
    it('throws when the article is missing', async () => {
      mockPrisma.faqArticle.findUnique.mockResolvedValue(null);
      await expect(service.deleteFaq('x')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.faqArticle.delete).not.toHaveBeenCalled();
    });
  });

  describe('createTicket()', () => {
    it('binds the ticket to the caller rather than trusting the body', async () => {
      mockPrisma.supportTicket.create.mockResolvedValue({});
      await service.createTicket('user-1', {
        subject: 'Cannot log in',
        message: 'OTP never arrives',
      } as any);

      expect(mockPrisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });
  });

  describe('findMyTickets()', () => {
    it('scopes the query to the requesting user', async () => {
      mockPrisma.supportTicket.findMany.mockResolvedValue([]);
      await service.findMyTickets('user-1');
      expect(mockPrisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
  });

  describe('updateTicketStatus()', () => {
    it('throws when the ticket is missing', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue(null);
      await expect(
        service.updateTicketStatus('t1', { status: 'OPEN' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('stamps resolvedAt when a ticket is resolved', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1' });
      mockPrisma.supportTicket.update.mockResolvedValue({});

      await service.updateTicketStatus('t1', { status: 'RESOLVED' } as any);

      const data = mockPrisma.supportTicket.update.mock.calls[0][0].data;
      expect(data.status).toBe('RESOLVED');
      expect(data.resolvedAt).toBeInstanceOf(Date);
    });

    it('leaves resolvedAt alone while a ticket is still open', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1' });
      mockPrisma.supportTicket.update.mockResolvedValue({});

      await service.updateTicketStatus('t1', { status: 'IN_PROGRESS' } as any);

      const data = mockPrisma.supportTicket.update.mock.calls[0][0].data;
      expect(data.resolvedAt).toBeUndefined();
    });
  });

  /**
   * A question a school has not published yet is a draft. The public list has
   * to leave it out, and the admin list has to show it.
   */
  describe('which questions are shown', () => {
    it('shows only published ones to everybody', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqs();
      expect(mockPrisma.faqArticle.findMany.mock.calls[0][0].where).toEqual({
        isPublished: true,
      });
    });

    it('shows the drafts too on the admin list', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqsAdmin();
      expect(
        mockPrisma.faqArticle.findMany.mock.calls[0][0],
      ).not.toHaveProperty('where');
    });

    it('reads in the order the school arranged them', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqs();
      expect(mockPrisma.faqArticle.findMany.mock.calls[0][0].orderBy).toEqual([
        { displayOrder: 'asc' },
        { title: 'asc' },
      ]);
    });

    it('searches the question and the answer', async () => {
      mockPrisma.faqArticle.findMany.mockResolvedValue([]);
      await service.findAllFaqs('password');
      const or = JSON.stringify(
        mockPrisma.faqArticle.findMany.mock.calls[0][0].where.OR,
      );
      expect(or).toContain('title');
      expect(or).toContain('content');
    });

    it('writes a new question', async () => {
      mockPrisma.faqArticle.create.mockResolvedValue({ id: 'faq-1' });
      await service.createFaq({
        title: 'How do I reset my password?',
        content: 'Ask the office.',
      });
      expect(mockPrisma.faqArticle.create).toHaveBeenCalledWith({
        data: {
          title: 'How do I reset my password?',
          content: 'Ask the office.',
        },
      });
    });

    it('changes one that does', async () => {
      mockPrisma.faqArticle.findUnique.mockResolvedValue({ id: 'faq-1' });
      mockPrisma.faqArticle.update.mockResolvedValue({});
      await service.updateFaq('faq-1', { title: 'Reworded' });
      expect(mockPrisma.faqArticle.update).toHaveBeenCalledWith({
        where: { id: 'faq-1' },
        data: { title: 'Reworded' },
      });
    });

    it('removes one that does', async () => {
      mockPrisma.faqArticle.findUnique.mockResolvedValue({ id: 'faq-1' });
      mockPrisma.faqArticle.delete.mockResolvedValue({});
      await service.deleteFaq('faq-1');
      expect(mockPrisma.faqArticle.delete).toHaveBeenCalledWith({
        where: { id: 'faq-1' },
      });
    });

    it('refuses to change a question that does not exist', async () => {
      mockPrisma.faqArticle.findUnique.mockResolvedValue(null);
      await expect(service.updateFaq('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to remove one that does not exist', async () => {
      mockPrisma.faqArticle.findUnique.mockResolvedValue(null);
      await expect(service.deleteFaq('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.faqArticle.delete).not.toHaveBeenCalled();
    });
  });

  /**
   * Tickets. The two reads are deliberately different: one is the whole
   * queue, one is mine, and confusing them would show a parent everything
   * anybody has ever raised.
   */
  describe('the support queue', () => {
    beforeEach(() => mockPrisma.supportTicket.findMany.mockResolvedValue([]));

    it('attributes a ticket to whoever raised it', async () => {
      mockPrisma.supportTicket.create.mockResolvedValue({});
      await service.createTicket('user-1', {
        title: 'Broken projector',
        description: 'It flickers',
      });
      expect(
        mockPrisma.supportTicket.create.mock.calls[0][0].data,
      ).toMatchObject({
        userId: 'user-1',
        title: 'Broken projector',
      });
    });

    it('reads the whole queue newest first', async () => {
      await service.findAllTickets();
      expect(mockPrisma.supportTicket.findMany.mock.calls[0][0].where).toEqual(
        {},
      );
      expect(
        mockPrisma.supportTicket.findMany.mock.calls[0][0].orderBy,
      ).toEqual({
        createdAt: 'desc',
      });
    });

    it('narrows the queue to one state', async () => {
      await service.findAllTickets('OPEN');
      expect(mockPrisma.supportTicket.findMany.mock.calls[0][0].where).toEqual({
        status: 'OPEN',
      });
    });

    it('reads one person’s own tickets and nobody else’s', async () => {
      await service.findMyTickets('user-1');
      expect(mockPrisma.supportTicket.findMany.mock.calls[0][0].where).toEqual({
        userId: 'user-1',
      });
    });

    it('refuses to move a ticket that does not exist', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue(null);
      await expect(
        service.updateTicketStatus('nope', { status: 'RESOLVED' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * "How long does the office take to answer" is only answerable if closing
     * a ticket writes down when it closed.
     */
    it.each(['RESOLVED', 'CLOSED'])(
      'dates a ticket moved to %s',
      async (status) => {
        mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't-1' });
        mockPrisma.supportTicket.update.mockResolvedValue({});
        await service.updateTicketStatus('t-1', { status } as never);
        expect(
          mockPrisma.supportTicket.update.mock.calls[0][0].data.resolvedAt,
        ).toBeInstanceOf(Date);
      },
    );

    it('does not date one that is only being picked up', async () => {
      mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't-1' });
      mockPrisma.supportTicket.update.mockResolvedValue({});
      await service.updateTicketStatus('t-1', {
        status: 'IN_PROGRESS',
      } as never);
      expect(
        mockPrisma.supportTicket.update.mock.calls[0][0].data,
      ).not.toHaveProperty('resolvedAt');
    });
  });
});
