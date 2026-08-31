import { AuditService } from './audit.service';

/**
 * Reading the record of who changed what.
 *
 * Every mutation has been written to `audit_logs` since the interceptor was
 * added, and there was no way to read any of it without a SQL client. That is
 * the shape of an audit trail nobody audits: it satisfies the letter of "we
 * keep a record" and answers no actual question.
 */
describe('the audit trail', () => {
  const prisma = {
    auditLog: { findMany: jest.fn(), count: jest.fn() },
  };
  const service = new AuditService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
  });

  it('shows the most recent first, which is what somebody is looking for', async () => {
    await service.find({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('names who did it, not just their id', async () => {
    await service.find({});
    const { include } = prisma.auditLog.findMany.mock.calls[0][0];
    expect(include.user.select).toMatchObject({
      firstName: true,
      lastName: true,
      role: true,
    });
  });

  describe('the questions it has to answer', () => {
    it('everything one person did', async () => {
      await service.find({ userId: 'u-1' });
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
        userId: 'u-1',
      });
    });

    it('everything that happened to one kind of record', async () => {
      await service.find({ entityType: 'marks' });
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
        entityType: 'marks',
      });
    });

    it('everything that was deleted', async () => {
      await service.find({ action: 'DELETE' });
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
        action: 'DELETE',
      });
    });

    /* A day is a whole day. Asking for Tuesday and getting nothing after
       midnight would be a filter that quietly loses most of what it is for. */
    it('a day, to the end of it', async () => {
      await service.find({ from: '2026-08-25', to: '2026-08-25' });
      const { createdAt } = prisma.auditLog.findMany.mock.calls[0][0].where as {
        createdAt: { gte: Date; lte: Date };
      };
      expect(createdAt.lte.getHours()).toBe(23);
      expect(createdAt.lte.getMinutes()).toBe(59);
    });
  });

  describe('how much it hands over at once', () => {
    it('pages, because this table outgrows the school', async () => {
      await service.find({ page: 3, limit: 20 });
      expect(prisma.auditLog.findMany.mock.calls[0][0]).toMatchObject({
        skip: 40,
        take: 20,
      });
    });

    /* This is the one page that could ask for the whole history of the school
       in a single request. */
    it('refuses to hand over more than a hundred rows', async () => {
      await service.find({ limit: 5000 });
      expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(100);
    });

    it('copes with a page number that makes no sense', async () => {
      await service.find({ page: -4 });
      expect(prisma.auditLog.findMany.mock.calls[0][0].skip).toBe(0);
    });

    it('says how many pages there are, so a reader knows where they are', async () => {
      prisma.auditLog.count.mockResolvedValue(101);
      const out = await service.find({ limit: 25 });
      expect(out.meta).toMatchObject({ total: 101, pages: 5 });
    });
  });

  /**
   * Redacted again on the way out, not only on the way in.
   *
   * Rows written before the redaction list covered medical details still hold
   * them, and this page is the one place somebody would read them. Filtering
   * here means the history is readable without reprinting a child's diagnosis
   * on screen.
   */
  describe('what it will not show', () => {
    it('withholds a diagnosis stored before the list covered it', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a-1',
          newValue: JSON.stringify({ studentId: 's-1', diagnosis: 'Asthma' }),
          oldValue: null,
        },
      ]);
      const out = await service.find({});
      expect(out.data[0].newValue).not.toContain('Asthma');
      expect(out.data[0].newValue).toContain('s-1');
    });

    it('withholds a password the same way', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a-1',
          newValue: JSON.stringify({ password: 'Secret1!' }),
          oldValue: null,
        },
      ]);
      const out = await service.find({});
      expect(out.data[0].newValue).not.toContain('Secret1!');
    });

    /* An older row stored a plain string, and there is no way to tell a field
       name from a value in one, so it is withheld rather than guessed at. */
    it('withholds a row it cannot read rather than printing it', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { id: 'a-1', newValue: 'password=Secret1!', oldValue: null },
      ]);
      const out = await service.find({});
      expect(out.data[0].newValue).toBe('[unreadable]');
    });

    it('leaves a row with nothing recorded alone', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { id: 'a-1', newValue: null, oldValue: null },
      ]);
      const out = await service.find({});
      expect(out.data[0].newValue).toBeNull();
    });
  });

  /* The filters offer what is actually there. A dropdown listing every kind of
     record the schema could hold would mostly select nothing. */
  describe('the filter options', () => {
    it('offers only the kinds of record actually present', async () => {
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { entityType: 'marks' },
          { entityType: 'users' },
        ])
        .mockResolvedValueOnce([{ action: 'POST' }, { action: 'DELETE' }]);
      const out = await service.filters();
      expect(out.entityTypes).toEqual(['marks', 'users']);
      expect(out.actions).toEqual(['POST', 'DELETE']);
    });
  });
});
