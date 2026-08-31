import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { redact } from '../../common/redaction';
import { QueryAuditDto } from './dto';

/**
 * Reading the record of who changed what.
 *
 * Every mutation has been written to `audit_logs` since the interceptor was
 * added, and until now there was no way to read any of it without opening a
 * SQL client. That is the shape of an audit trail nobody audits: it satisfies
 * the letter of "we keep a record" and answers no actual question.
 *
 * The questions it has to answer are specific, which is what the filters are
 * for: who changed this student's marks, what did this member of staff do on
 * Tuesday, and what has been deleted this term.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async find(query: QueryAuditDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const where: Record<string, unknown> = {};
    if (query.userId) where.userId = query.userId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action;

    /*
      A day is a day in the school's own time, not UTC. Asking for "Tuesday"
      and getting two hours of Monday evening is the same class of bug as the
      register landing on the wrong day.
    */
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      where.createdAt = range;
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              role: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...row,
        /*
          Redacted again on the way out, not only on the way in.

          The rows written before the redaction list covered medical details
          still hold them, and this page is the one place somebody would read
          them. Filtering here means the history is readable without reprinting
          a child's diagnosis on screen.
        */
        newValue: this.safe(row.newValue),
        oldValue: this.safe(row.oldValue),
      })),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** The distinct values actually present, so the filters offer real options. */
  async filters() {
    const [entityTypes, actions] = await Promise.all([
      this.prisma.auditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        where: { entityType: { not: null } },
        orderBy: { entityType: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ]);

    return {
      entityTypes: entityTypes.map((e) => e.entityType).filter(Boolean),
      actions: actions.map((a) => a.action),
    };
  }

  private safe(value: string | null): string | null {
    if (!value) return null;
    try {
      return JSON.stringify(redact(JSON.parse(value)));
    } catch {
      /* Not JSON. Older rows stored a plain string, and there is no way to
         tell a field name from a value in one, so it is withheld rather than
         guessed at. */
      return '[unreadable]';
    }
  }
}
