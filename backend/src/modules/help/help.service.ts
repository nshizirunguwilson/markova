import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFaqDto,
  UpdateFaqDto,
  CreateTicketDto,
  UpdateTicketStatusDto,
} from './dto';

@Injectable()
export class HelpService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // FAQ ARTICLES
  // ═══════════════════════════════════════════════════════════════════════════

  async createFaq(dto: CreateFaqDto) {
    return this.prisma.faqArticle.create({ data: dto });
  }

  async updateFaq(id: string, dto: UpdateFaqDto) {
    const article = await this.prisma.faqArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('FAQ article not found');
    return this.prisma.faqArticle.update({ where: { id }, data: dto });
  }

  async deleteFaq(id: string) {
    const article = await this.prisma.faqArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('FAQ article not found');
    return this.prisma.faqArticle.delete({ where: { id } });
  }

  async findAllFaqs(search?: string) {
    const where: any = { isPublished: true };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.faqArticle.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async findAllFaqsAdmin() {
    return this.prisma.faqArticle.findMany({
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════════════════════

  async createTicket(userId: string, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: { ...dto, userId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async findAllTickets(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMyTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTicketStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const data: any = { status: dto.status };
    if (dto.status === 'RESOLVED' || dto.status === 'CLOSED') {
      data.resolvedAt = new Date();
    }

    return this.prisma.supportTicket.update({
      where: { id },
      data,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }
}
