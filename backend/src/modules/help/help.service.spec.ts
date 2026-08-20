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
      providers: [HelpService, { provide: PrismaService, useValue: mockPrisma }],
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
});
