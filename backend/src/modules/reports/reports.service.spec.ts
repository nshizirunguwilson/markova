import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Report cards and student ID cards.
 *
 * Two things here are checked by strangers rather than by the school: a
 * printed report card carries a code somebody can look up, and a student card
 * carries a QR somebody scans at a gate. Both answer publicly, so what they
 * refuse and what they reveal are the tests worth having.
 *
 * The rest is card lifecycle. Suspend, restore and revoke look similar and
 * mean very different things: one is a card temporarily out of use, one brings
 * it back, and one destroys the code so the printed card can never work again.
 */
describe('ReportsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
  });

  const student = (over: Record<string, unknown> = {}) => ({
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    classSectionId: 'section-1',
    status: 'ACTIVE',
    nfcCardId: null,
    cardIssuedAt: null,
    cardCode: null,
    cardSuspendedAt: null,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', order: 1 },
      trade: null,
    },
    ...over,
  });

  // ── Issuing ───────────────────────────────────────────────────────────────

  describe('issuing a card', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue(student());
      prisma.student.update.mockResolvedValue({});
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.issueIdCard('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives the card an id and a verification code', async () => {
      await service.issueIdCard('student-1');
      const data = prisma.student.update.mock.calls[0][0].data;
      expect(data.nfcCardId).toMatch(/^\d{4} \d{4} \d{4}$/);
      expect(data.cardCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      expect(data.cardIssuedAt).toBeInstanceOf(Date);
    });

    /**
     * Crockford base32. I, L, O and U are left out because they are the
     * characters people confuse when reading a code off a card down a phone.
     */
    it('leaves the letters people misread out of the code', async () => {
      for (let i = 0; i < 40; i++) {
        prisma.student.update.mockClear();
        await service.issueIdCard('student-1');
        const code: string =
          prisma.student.update.mock.calls[0][0].data.cardCode;
        expect(code).not.toMatch(/[ILOU]/);
      }
    });

    it('gives a different code every time', async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        prisma.student.update.mockClear();
        await service.issueIdCard('student-1');
        codes.add(prisma.student.update.mock.calls[0][0].data.cardCode);
      }
      expect(codes.size).toBe(20);
    });

    // Reissuing is what makes a lost card stop working, so the new card must
    // never come back usable-but-suspended from the old one's state.
    it('starts a newly issued card unsuspended', async () => {
      prisma.student.findUnique.mockResolvedValue(
        student({ cardSuspendedAt: new Date(), nfcCardId: '1111 2222 3333' }),
      );
      await service.issueIdCard('student-1', true);
      expect(
        prisma.student.update.mock.calls[0][0].data.cardSuspendedAt,
      ).toBeNull();
    });

    it('leaves an existing card alone unless forced', async () => {
      prisma.student.findUnique.mockResolvedValue(
        student({ nfcCardId: '1111 2222 3333' }),
      );
      await service.issueIdCard('student-1');
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('replaces an existing card when forced', async () => {
      prisma.student.findUnique.mockResolvedValue(
        student({ nfcCardId: '1111 2222 3333' }),
      );
      await service.issueIdCard('student-1', true);
      expect(prisma.student.update).toHaveBeenCalled();
    });

    it('tries another id when the first one is already taken', async () => {
      let call = 0;
      prisma.student.findUnique.mockImplementation((args: any) => {
        if (args.where?.id) return Promise.resolve(student());
        // The first candidate clashes; the second is free.
        call += 1;
        return Promise.resolve(call === 1 ? { id: 'someone-else' } : null);
      });
      await service.issueIdCard('student-1');
      expect(prisma.student.update).toHaveBeenCalled();
    });

    it('issues only for students in a class who have no card yet', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      prisma.student.findUnique.mockResolvedValue(student());

      const result = await service.issueBulkIdCards('section-1');
      expect(result).toEqual({ issued: 2 });
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            classSectionId: 'section-1',
            status: 'ACTIVE',
            nfcCardId: null,
          },
        }),
      );
    });
  });

  // ── Suspend, restore, revoke ──────────────────────────────────────────────

  describe('a card mislaid, and a card lost for good', () => {
    beforeEach(() => {
      prisma.student.update.mockResolvedValue({});
    });

    it('suspends a card by dating the suspension, keeping the code', async () => {
      prisma.student.findUnique.mockResolvedValue(
        student({ cardCode: 'ABCD-EFGH-JKMN' }),
      );
      await service.suspendIdCard('student-1');
      const data = prisma.student.update.mock.calls[0][0].data;
      expect(data.cardSuspendedAt).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty('cardCode');
    });

    it('refuses to suspend a card that was never issued', async () => {
      prisma.student.findUnique.mockResolvedValue(student({ cardCode: null }));
      await expect(service.suspendIdCard('student-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('refuses to suspend for a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.suspendIdCard('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('restores a card by clearing the suspension', async () => {
      prisma.student.findUnique.mockResolvedValue(student({ id: 'student-1' }));
      await service.restoreIdCard('student-1');
      expect(prisma.student.update.mock.calls[0][0].data).toEqual({
        cardSuspendedAt: null,
      });
    });

    it('refuses to restore for a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.restoreIdCard('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * Clearing the code is the revocation. The printed card still scans; the
     * verification page is what answers that it is not valid.
     */
    it('revokes by destroying the code, not by flagging it', async () => {
      prisma.student.findUnique.mockResolvedValue(
        student({ cardCode: 'ABCD-EFGH-JKMN', nfcCardId: '1111 2222 3333' }),
      );
      await service.revokeIdCard('student-1');
      expect(prisma.student.update.mock.calls[0][0].data).toEqual({
        nfcCardId: null,
        cardIssuedAt: null,
        cardCode: null,
        cardSuspendedAt: null,
      });
    });

    it('refuses to revoke for a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.revokeIdCard('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── The public card check ─────────────────────────────────────────────────

  /**
   * Anyone at a gate can call this without an account, so it has to answer
   * enough to be useful and nothing more. A found card must not become a way
   * to reach a child.
   */
  describe('checking a card at a gate', () => {
    it('says a code nobody recognises is not valid', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/never issued|reissued/i);
      expect(result).not.toHaveProperty('student');
    });

    it('confirms a card belonging to a student still on the roll', async () => {
      prisma.student.findUnique.mockResolvedValue({
        studentIdNumber: 'STD-2026-001',
        status: 'ACTIVE',
        cardIssuedAt: new Date('2026-01-10'),
        cardSuspendedAt: null,
        user: {
          firstName: 'Divine',
          lastName: 'Niyonkuru',
          photoUrl: '/p.png',
        },
        classSection: { classLevel: { name: 'Senior 1' } },
      });

      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.student).toEqual({
        name: 'Divine Niyonkuru',
        studentIdNumber: 'STD-2026-001',
        level: 'Senior 1',
        photoUrl: '/p.png',
        status: 'ACTIVE',
      });
    });

    // The photo is the point: it is what catches a real card being carried by
    // somebody else.
    it('carries the school’s own photo so a face can be checked', async () => {
      prisma.student.findUnique.mockResolvedValue({
        studentIdNumber: 'STD-2026-001',
        status: 'ACTIVE',
        cardIssuedAt: null,
        cardSuspendedAt: null,
        user: {
          firstName: 'A',
          lastName: 'B',
          photoUrl: '/uploads/photos/x.jpg',
        },
        classSection: { classLevel: { name: 'Senior 1' } },
      });
      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      expect(result.student!.photoUrl).toBe('/uploads/photos/x.jpg');
    });

    it('reveals nothing that could be used to reach the child', async () => {
      prisma.student.findUnique.mockResolvedValue({
        studentIdNumber: 'STD-2026-001',
        status: 'ACTIVE',
        cardIssuedAt: null,
        cardSuspendedAt: null,
        user: { firstName: 'A', lastName: 'B', photoUrl: null },
        classSection: { classLevel: { name: 'Senior 1' } },
      });
      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      const shown = JSON.stringify(result);
      expect(shown).not.toMatch(/phone|email|address|parent/i);
    });

    // A suspended card is a real card its holder has temporarily lost the use
    // of, which is a different answer from one that was never issued.
    it('says a suspended card is suspended, not unknown', async () => {
      prisma.student.findUnique.mockResolvedValue({
        studentIdNumber: 'STD-2026-001',
        status: 'ACTIVE',
        cardIssuedAt: new Date('2026-01-10'),
        cardSuspendedAt: new Date('2026-08-01'),
        user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
        classSection: { classLevel: { name: 'Senior 1' } },
      });

      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      expect(result.valid).toBe(false);
      expect(result.suspended).toBe(true);
      expect(result.reason).toMatch(/suspended/i);
      expect(result.student!.name).toBe('Divine Niyonkuru');
    });

    it('refuses a card belonging to somebody who has left', async () => {
      prisma.student.findUnique.mockResolvedValue({
        studentIdNumber: 'STD-2026-001',
        status: 'TRANSFERRED',
        cardIssuedAt: null,
        cardSuspendedAt: null,
        user: { firstName: 'A', lastName: 'B', photoUrl: null },
        classSection: { classLevel: { name: 'Senior 1' } },
      });

      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/no longer enrolled \(transferred\)/i);
    });

    it('copes with a student whose class was never set', async () => {
      prisma.student.findUnique.mockResolvedValue({
        studentIdNumber: 'STD-2026-001',
        status: 'ACTIVE',
        cardIssuedAt: null,
        cardSuspendedAt: null,
        user: { firstName: 'A', lastName: 'B', photoUrl: null },
        classSection: null,
      });
      const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
      expect(result.student!.level).toBeNull();
    });
  });

  // ── The public report check ───────────────────────────────────────────────

  /**
   * Twelve digits, and the shape is checked before the database is touched.
   * A public endpoint that queries on anything a caller sends is a public
   * endpoint somebody will point a scanner at.
   */
  describe('checking a printed report card', () => {
    it.each(['abc', '1234', '1234-5678-90', 'AAAA-BBBB-CCCC', ''])(
      'refuses %s without looking it up',
      async (code) => {
        await expect(service.verifyReportByCode(code)).rejects.toThrow(
          NotFoundException,
        );
        expect(prisma.reportVerification.findUnique).not.toHaveBeenCalled();
      },
    );

    it('refuses a well-formed code nobody issued', async () => {
      prisma.reportVerification.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyReportByCode('1234-5678-9012'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('allocating a verification code', () => {
    it('reuses the one a result already has', async () => {
      prisma.reportVerification.findUnique.mockResolvedValue({
        id: 'v-1',
        code: '1111-2222-3333',
      });
      const result = await service.ensureVerification('res-1');
      expect(result).toMatchObject({ code: '1111-2222-3333' });
      expect(prisma.reportVerification.create).not.toHaveBeenCalled();
    });

    it('allocates one in the printed shape', async () => {
      prisma.reportVerification.findUnique.mockResolvedValue(null);
      prisma.reportVerification.create.mockImplementation((args: any) =>
        Promise.resolve(args.data),
      );

      const result: any = await service.ensureVerification('res-1');
      expect(result.code).toMatch(/^\d{4}-\d{4}-\d{4}$/);
    });

    // Two requests for the same report card at once must end up sharing one
    // code rather than one of them failing.
    it('reuses the code a concurrent request just created', async () => {
      prisma.reportVerification.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'v-1', code: '1111-2222-3333' });
      prisma.reportVerification.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.ensureVerification('res-1');
      expect(result).toMatchObject({ code: '1111-2222-3333' });
    });

    it('tries again when the code itself collided', async () => {
      prisma.reportVerification.findUnique.mockResolvedValue(null);
      prisma.reportVerification.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockImplementation((args: any) => Promise.resolve(args.data));

      const result: any = await service.ensureVerification('res-1');
      expect(result.code).toMatch(/^\d{4}-\d{4}-\d{4}$/);
    });

    it('gives up rather than looping forever', async () => {
      prisma.reportVerification.findUnique.mockResolvedValue(null);
      prisma.reportVerification.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.ensureVerification('res-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('lets a real database error through rather than retrying it', async () => {
      prisma.reportVerification.findUnique.mockResolvedValue(null);
      prisma.reportVerification.create.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(service.ensureVerification('res-1')).rejects.toThrow(
        'Connection refused',
      );
      expect(prisma.reportVerification.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── The card register ─────────────────────────────────────────────────────

  /**
   * The counts describe the whole filtered roll, not the page on screen. "6
   * have a card out of 773" is the number an admin acts on, and it must not
   * change as they page.
   */
  describe('the card register', () => {
    beforeEach(() => {
      prisma.student.count.mockResolvedValue(0);
      prisma.student.findMany.mockResolvedValue([]);
    });

    it('counts across the whole roll, not the page', async () => {
      prisma.student.count
        .mockResolvedValueOnce(773)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(2);

      const result = await service.getIdCardRegistry({ page: 3, limit: 25 });
      expect(result).toMatchObject({
        total: 773,
        issued: 6,
        notIssued: 767,
        suspended: 2,
      });
      expect(result.meta).toEqual({
        total: 773,
        page: 3,
        limit: 25,
        totalPages: 31,
      });
    });

    it('shows only students still on the roll', async () => {
      await service.getIdCardRegistry({});
      expect(prisma.student.count.mock.calls[0][0].where).toMatchObject({
        status: 'ACTIVE',
      });
    });

    it.each([
      ['issued', { nfcCardId: { not: null } }],
      ['not_issued', { nfcCardId: null }],
      ['suspended', { cardSuspendedAt: { not: null } }],
    ])('narrows to %s', async (status, expected) => {
      await service.getIdCardRegistry({ status });
      expect(prisma.student.count.mock.calls[0][0].where).toMatchObject(
        expected,
      );
    });

    // A card is looked up by the number printed on it as often as by name.
    it('searches the card number as well as the name', async () => {
      await service.getIdCardRegistry({ search: 'Divine' });
      const or = prisma.student.count.mock.calls[0][0].where.OR;
      const fields = JSON.stringify(or);
      expect(fields).toContain('studentIdNumber');
      expect(fields).toContain('nfcCardId');
      expect(fields).toContain('firstName');
      expect(fields).toContain('lastName');
    });

    it('ignores a search of nothing but spaces', async () => {
      await service.getIdCardRegistry({ search: '   ' });
      expect(prisma.student.count.mock.calls[0][0].where).not.toHaveProperty(
        'OR',
      );
    });

    it('reads in school order, then by name', async () => {
      await service.getIdCardRegistry({});
      expect(prisma.student.findMany.mock.calls[0][0].orderBy).toEqual([
        { classSection: { classLevel: { order: 'asc' } } },
        { user: { firstName: 'asc' } },
      ]);
    });

    it('refuses a page size big enough to pull the whole school', async () => {
      await service.getIdCardRegistry({ limit: 5000 });
      expect(prisma.student.findMany.mock.calls[0][0].take).toBe(100);
    });

    it('treats nonsense paging as the first page', async () => {
      await service.getIdCardRegistry({ page: -3, limit: 0 });
      expect(prisma.student.findMany.mock.calls[0][0].skip).toBe(0);
      expect(prisma.student.findMany.mock.calls[0][0].take).toBe(25);
    });

    it('always reports at least one page, even for an empty roll', async () => {
      const result = await service.getIdCardRegistry({});
      expect(result.meta.totalPages).toBe(1);
    });

    it('describes each student’s card in one shape', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ nfcCardId: '1111 2222 3333', cardCode: 'ABCD-EFGH-JKMN' }),
      ]);
      const result = await service.getIdCardRegistry({});
      expect(result.items[0]).toMatchObject({
        name: 'Divine Niyonkuru',
        class: 'Senior 1 A',
        level: 'Senior 1',
        cardId: '1111 2222 3333',
        hasCard: true,
        suspended: false,
      });
      expect(result.items[0].verifyUrl).toMatch(
        /\/verify\/card\/ABCD-EFGH-JKMN$/,
      );
    });

    it('offers no verification link for a student with no card', async () => {
      prisma.student.findMany.mockResolvedValue([student()]);
      const result = await service.getIdCardRegistry({});
      expect(result.items[0].verifyUrl).toBeNull();
      expect(result.items[0].hasCard).toBe(false);
    });
  });

  describe('the printed QR', () => {
    it('is nothing at all for a student with no card', async () => {
      prisma.student.findUnique.mockResolvedValue({ cardCode: null });
      await expect(service.cardQr('student-1')).resolves.toBeNull();
    });

    it('is nothing at all for a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.cardQr('nobody')).resolves.toBeNull();
    });

    it('encodes the verification page, not the raw code', async () => {
      prisma.student.findUnique.mockResolvedValue({
        cardCode: 'ABCD-EFGH-JKMN',
        studentIdNumber: 'STD-2026-001',
      });
      const uri = await service.cardQr('student-1');
      expect(uri).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('shutting down', () => {
    it('does nothing when no browser was ever started', async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('closes the browser it started', async () => {
      const close = jest.fn().mockResolvedValue(undefined);
      (service as any).browserPromise = Promise.resolve({ close });
      await service.onModuleDestroy();
      expect(close).toHaveBeenCalled();
    });

    // A browser that already died must not stop the process shutting down.
    it('shuts down even when the browser never launched', async () => {
      (service as any).browserPromise = Promise.reject(new Error('no chrome'));
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('shuts down even when closing the browser fails', async () => {
      const close = jest.fn().mockRejectedValue(new Error('already gone'));
      (service as any).browserPromise = Promise.resolve({ close });
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});

/**
 * The card register, and the summary each card action reads back.
 *
 * The summary is what the office sees after issuing, suspending or restoring
 * a card, and it reaches through two joins to name the student's year level.
 * A student not yet placed in a class has neither, and the office still has
 * to be told the card was issued.
 */
describe('the summary an office reads back after a card action', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const placed = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    classSectionId: 'section-1',
    status: 'ACTIVE',
    nfcCardId: '1234 5678 9012',
    cardIssuedAt: new Date('2026-08-01'),
    cardCode: 'ABCD-EFGH-JKMN',
    cardSuspendedAt: null,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', order: 1 },
      trade: null,
    },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.update.mockResolvedValue({});
  });

  it('names the year level of a student who has a class', async () => {
    prisma.student.findUnique.mockResolvedValue(placed);

    const summary = await service.issueIdCard('student-1');
    expect(summary).toMatchObject({
      name: 'Divine Niyonkuru',
      level: 'Senior 1',
      hasCard: true,
    });
  });

  // A student admitted mid-term is on the roll before they are placed.
  it('leaves the level blank for a student in no class yet', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...placed,
      classSectionId: null,
      classSection: null,
    });

    const summary = await service.issueIdCard('student-1');
    expect(summary.level).toBeNull();
    expect(summary.name).toBe('Divine Niyonkuru');
  });

  it('leaves it blank when the class has no year level behind it', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...placed,
      classSection: { name: 'A', classLevel: null, trade: null },
    });

    const summary = await service.issueIdCard('student-1');
    expect(summary.level).toBeNull();
  });

  it('refuses to summarise a student who does not exist', async () => {
    prisma.student.findUnique.mockResolvedValue(null);

    await expect(service.suspendIdCard('nobody')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('narrowing the card register to one class', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.count.mockResolvedValue(0);
    prisma.student.findMany.mockResolvedValue([]);
  });

  it('filters by class when one is named', async () => {
    await service.getIdCardRegistry({ classSectionId: 'section-1' });

    expect(prisma.student.count.mock.calls[0][0].where).toMatchObject({
      status: 'ACTIVE',
      classSectionId: 'section-1',
    });
  });

  it('looks across the whole school when none is', async () => {
    await service.getIdCardRegistry({});

    expect(
      prisma.student.count.mock.calls[0][0].where.classSectionId,
    ).toBeUndefined();
  });
});

/**
 * Checking a card that was suspended.
 *
 * A suspended card is a different answer from one that was never issued: the
 * first means the school withheld it, and the gate needs to say so rather
 * than "no such card".
 */
describe('a card the school has withheld', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const suspended = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    status: 'ACTIVE',
    nfcCardId: '1234 5678 9012',
    cardCode: 'ABCD-EFGH-JKMN',
    cardIssuedAt: new Date('2026-08-01'),
    cardSuspendedAt: new Date('2026-08-20'),
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: { name: 'A', classLevel: { name: 'Senior 1' }, trade: null },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
  });

  it('says it is suspended, and names the student anyway', async () => {
    prisma.student.findUnique.mockResolvedValue(suspended);

    const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
    expect(result).toMatchObject({
      valid: false,
      suspended: true,
      student: { name: 'Divine Niyonkuru', level: 'Senior 1' },
    });
  });

  it('leaves the level blank for a suspended card with no class', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...suspended,
      classSection: null,
    });

    const result = await service.verifyCardByCode('ABCD-EFGH-JKMN');
    expect(result.student?.level).toBeNull();
  });
});
