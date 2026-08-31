import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdmissionsService } from './admissions.service';

/**
 * Admissions.
 *
 * What is worth holding here is not the happy path but the properties that
 * make the record trustworthy: every move leaves a row in the trail, a place
 * cannot be promised twice, a family cannot be enrolled without having
 * accepted, and looking up somebody else's application tells you nothing.
 */
describe('AdmissionsService', () => {
  const prisma: any = {
    admissionIntake: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    applicationEvent: { create: jest.fn() },
    applicationNote: { create: jest.fn() },
    applicationDocument: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    admissionOffer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    classSection: { findUnique: jest.fn() },
    student: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    parentStudent: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const service = new AdmissionsService(prisma as never);

  const OPEN_INTAKE = {
    id: 'intake-1',
    classLevelId: 'level-1',
    entryPoint: 'SENIOR_ONE',
    places: 40,
    isOpen: true,
    opensAt: new Date('2026-01-01'),
    closesAt: new Date('2099-01-01'),
  };

  const application = (over: Record<string, unknown> = {}) => ({
    id: 'app-1',
    intakeId: 'intake-1',
    reference: 'APP-2026-0417',
    status: 'UNDER_REVIEW',
    firstName: 'Aline',
    lastName: 'Uwase',
    dateOfBirth: new Date('2013-04-02'),
    gender: 'FEMALE',
    isBoarder: true,
    funding: 'FAMILY',
    guardianName: 'Marie Claire Uwase',
    guardianPhone: '+250788100000',
    guardianRelation: 'Mother',
    intake: OPEN_INTAKE,
    ...over,
  });

  const submission = {
    intakeId: 'intake-1',
    firstName: 'Aline',
    lastName: 'Uwase',
    dateOfBirth: '2013-04-02',
    gender: 'FEMALE',
    guardianName: 'Marie Claire Uwase',
    guardianPhone: '+250788100000',
    guardianRelation: 'Mother',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.application.findFirst.mockResolvedValue(null);
    prisma.application.create.mockResolvedValue({
      id: 'app-1',
      reference: 'APP-2026-0001',
    });
    prisma.application.update.mockResolvedValue({});
    prisma.applicationEvent.create.mockResolvedValue({});
    prisma.application.groupBy.mockResolvedValue([]);
  });

  // ── A family applies ──────────────────────────────────────────────────

  describe('taking an application', () => {
    beforeEach(() => {
      prisma.admissionIntake.findUnique.mockResolvedValue(OPEN_INTAKE);
    });

    it('gives it a reference of its own', async () => {
      const result = await service.submit(submission);
      expect(result.reference).toBe('APP-2026-0001');
      expect(prisma.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: expect.stringMatching(/^APP-\d{4}-\d{4}$/),
          }),
        }),
      );
    });

    /*
      Drawn inside the write, so two families submitting at the same moment
      cannot be handed the same one.
    */
    it('draws the reference inside the transaction', async () => {
      await service.submit(submission);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    /**
     * Without this row the first thing that ever happened to the application
     * has no record, and the trail starts halfway through.
     */
    it('writes the arrival into the trail', async () => {
      await service.submit(submission);
      expect(prisma.applicationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toStatus: 'SUBMITTED' }),
        }),
      );
    });

    it('refuses an intake that is closed', async () => {
      prisma.admissionIntake.findUnique.mockResolvedValue({
        ...OPEN_INTAKE,
        isOpen: false,
      });
      await expect(service.submit(submission)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an intake that has not opened yet', async () => {
      prisma.admissionIntake.findUnique.mockResolvedValue({
        ...OPEN_INTAKE,
        opensAt: new Date('2099-01-01'),
      });
      await expect(service.submit(submission)).rejects.toThrow(/closed/i);
    });

    it('says so when the intake does not exist', async () => {
      prisma.admissionIntake.findUnique.mockResolvedValue(null);
      await expect(service.submit(submission)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a date of birth it cannot read', async () => {
      await expect(
        service.submit({ ...(submission as any), dateOfBirth: 'last Tuesday' }),
      ).rejects.toThrow(/cannot be read/i);
    });

    // A child born tomorrow is a typo, and it would sit in the queue forever.
    it('refuses a date of birth in the future', async () => {
      await expect(
        service.submit({ ...(submission as any), dateOfBirth: '2099-01-01' }),
      ).rejects.toThrow(/future/i);
    });

    it('trims what the family typed', async () => {
      await service.submit({ ...(submission as any), firstName: '  Aline  ' });
      expect(prisma.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ firstName: 'Aline' }),
        }),
      );
    });
  });

  // ── Moving it along ───────────────────────────────────────────────────

  describe('deciding', () => {
    it('records who moved it, from what, to what, and why', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      await service.decide(
        'app-1',
        { status: 'REJECTED', reason: 'Below the mark' } as never,
        'admin-1',
      );
      expect(prisma.applicationEvent.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          fromStatus: 'UNDER_REVIEW',
          toStatus: 'REJECTED',
          reason: 'Below the mark',
          actorUserId: 'admin-1',
        },
      });
    });

    /**
     * The trail is written before the status, so a failure leaves the record
     * of what was attempted rather than a state nobody can account for.
     */
    it('refuses a step the machine does not allow, and writes nothing', async () => {
      prisma.application.findUnique.mockResolvedValue(
        application({ status: 'SUBMITTED' }),
      );
      await expect(
        service.decide('app-1', { status: 'ENROLLED' } as never, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.applicationEvent.create).not.toHaveBeenCalled();
      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('refuses a rejection with no reason on it', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      await expect(
        service.decide('app-1', { status: 'REJECTED' } as never, 'admin-1'),
      ).rejects.toThrow(/say why/i);
    });

    it('stamps the day a decision was made', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      await service.decide(
        'app-1',
        { status: 'REJECTED', reason: 'Below the mark' } as never,
        'admin-1',
      );
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ decidedAt: expect.any(Date) }),
        }),
      );
    });

    it('says so when the application is not there', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await expect(
        service.decide('nope', { status: 'UNDER_REVIEW' } as never, 'a'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * A checklist rather than free text, because otherwise nobody on either side
   * can say what is still outstanding three weeks later.
   */
  describe('asking the family for what is missing', () => {
    beforeEach(() => {
      prisma.application.findUnique.mockResolvedValue(application());
    });

    it('names each document in the words the family will use', async () => {
      await service.requestInfo(
        'app-1',
        { documents: ['BIRTH_CERTIFICATE', 'PASSPORT_PHOTO'] } as never,
        'admin-1',
      );
      const written =
        prisma.applicationEvent.create.mock.calls[0][0].data.reason;
      expect(written).toContain('Birth certificate');
      expect(written).toContain('Passport photograph');
    });

    it('carries a note alongside the list', async () => {
      await service.requestInfo(
        'app-1',
        {
          documents: ['PASSPORT_PHOTO'],
          note: 'The last one was too dark',
        } as never,
        'admin-1',
      );
      expect(
        prisma.applicationEvent.create.mock.calls[0][0].data.reason,
      ).toContain('too dark');
    });

    // An empty request tells the family nothing and stops the school's clock
    // for no reason.
    it('refuses a request that asks for nothing', async () => {
      await expect(
        service.requestInfo('app-1', { documents: [] }, 'admin-1'),
      ).rejects.toThrow(/what is missing/i);
    });
  });

  // ── Offers ────────────────────────────────────────────────────────────

  describe('offering a place', () => {
    const offerDto = {
      classSectionId: 'section-1',
      expiresAt: '2099-01-01',
    } as never;

    beforeEach(() => {
      prisma.application.findUnique.mockResolvedValue(application());
      prisma.classSection.findUnique.mockResolvedValue({
        id: 'section-1',
        classLevelId: 'level-1',
      });
      prisma.admissionIntake.findUnique.mockResolvedValue(OPEN_INTAKE);
      prisma.admissionOffer.create.mockResolvedValue({ id: 'offer-1' });
    });

    it('holds the place and moves the application', async () => {
      await service.makeOffer('app-1', offerDto, 'admin-1');
      expect(prisma.admissionOffer.create).toHaveBeenCalled();
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'OFFERED' }),
        }),
      );
    });

    /**
     * An outstanding offer is a place spent. Without this a school offers the
     * same forty places twice and finds out in January.
     */
    it('refuses when the intake has no places left', async () => {
      prisma.application.groupBy.mockResolvedValue([
        { status: 'OFFERED', _count: { _all: 40 } },
      ]);
      await expect(
        service.makeOffer('app-1', offerDto, 'admin-1'),
      ).rejects.toThrow(/no places left/i);
    });

    it('refuses a class from another level', async () => {
      prisma.classSection.findUnique.mockResolvedValue({
        id: 'section-9',
        classLevelId: 'level-9',
      });
      await expect(
        service.makeOffer('app-1', offerDto, 'admin-1'),
      ).rejects.toThrow(/not in the level/i);
    });

    // An offer that has already expired is not an offer.
    it('refuses an expiry in the past', async () => {
      await expect(
        service.makeOffer(
          'app-1',
          { classSectionId: 'section-1', expiresAt: '2020-01-01' },
          'admin-1',
        ),
      ).rejects.toThrow(/expire in the past/i);
    });

    it('takes the boarding choice from the family when none is given', async () => {
      await service.makeOffer('app-1', offerDto, 'admin-1');
      expect(prisma.admissionOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBoarder: true }),
        }),
      );
    });
  });

  describe('taking a held place back', () => {
    it('returns the application to the pile rather than ending it', async () => {
      prisma.admissionOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        revokedAt: null,
        acceptedAt: null,
        application: application({ status: 'OFFERED' }),
      });
      prisma.admissionOffer.update.mockResolvedValue({});
      await service.revokeOffer(
        'offer-1',
        'Went to a waitlisted family',
        'admin-1',
      );
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'UNDER_REVIEW' }),
        }),
      );
    });

    /**
     * Withdrawing a place a family has already taken is a different
     * conversation, and this is not it.
     */
    it('refuses to withdraw a place the family has accepted', async () => {
      prisma.admissionOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        revokedAt: null,
        acceptedAt: new Date(),
        application: application(),
      });
      await expect(
        service.revokeOffer('offer-1', 'changed our mind', 'admin-1'),
      ).rejects.toThrow(/different conversation/i);
    });

    it('refuses to withdraw one twice', async () => {
      prisma.admissionOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        revokedAt: new Date(),
        application: application(),
      });
      await expect(service.revokeOffer('offer-1', 'x', 'a')).rejects.toThrow(
        /already been withdrawn/i,
      );
    });
  });

  /**
   * Places held by families who stopped replying are places the school cannot
   * give to the waitlist, so the expiry has to actually do something.
   */
  describe('offers nobody answered', () => {
    it('releases the place and puts the application back in the pile', async () => {
      prisma.admissionOffer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          application: application({ status: 'OFFERED' }),
        },
      ]);
      prisma.admissionOffer.update.mockResolvedValue({});
      const result = await service.expireOffers();
      expect(result).toEqual({ expired: 1 });
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'UNDER_REVIEW' }),
        }),
      );
    });

    // The family answered while the sweep was running.
    it('leaves an application that has moved on since', async () => {
      prisma.admissionOffer.findMany.mockResolvedValue([
        { id: 'offer-1', application: application({ status: 'ACCEPTED' }) },
      ]);
      expect(await service.expireOffers()).toEqual({ expired: 0 });
    });
  });

  // ── The family answers ────────────────────────────────────────────────

  describe('a family answering their offer', () => {
    beforeEach(() => {
      prisma.application.findUnique.mockResolvedValue(
        application({ status: 'OFFERED' }),
      );
      prisma.admissionOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        expiresAt: new Date('2099-01-01'),
      });
      prisma.admissionOffer.update.mockResolvedValue({});
    });

    it('accepts the place', async () => {
      await service.respondToOffer('APP-2026-0417', '2013-04-02', true);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACCEPTED' }),
        }),
      );
    });

    it('records a decline as the family withdrawing, with their reason', async () => {
      await service.respondToOffer(
        'APP-2026-0417',
        '2013-04-02',
        false,
        'We took a place elsewhere',
      );
      const event = prisma.applicationEvent.create.mock.calls[0][0].data;
      expect(event.toStatus).toBe('WITHDRAWN');
      expect(event.reason).toContain('elsewhere');
    });

    // The family did this themselves; there is no member of staff to name.
    it('names no actor for what the family did', async () => {
      await service.respondToOffer('APP-2026-0417', '2013-04-02', true);
      expect(
        prisma.applicationEvent.create.mock.calls[0][0].data.actorUserId,
      ).toBeNull();
    });

    it('refuses an offer that has already run out', async () => {
      prisma.admissionOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        expiresAt: new Date('2020-01-01'),
      });
      await expect(
        service.respondToOffer('APP-2026-0417', '2013-04-02', true),
      ).rejects.toThrow(/expired/i);
    });

    it('says so when there is no offer to answer', async () => {
      prisma.admissionOffer.findFirst.mockResolvedValue(null);
      await expect(
        service.respondToOffer('APP-2026-0417', '2013-04-02', true),
      ).rejects.toThrow(/no offer/i);
    });
  });

  /**
   * Reached without an account, so it is proved by something only the family
   * knows.
   */
  describe('looking up an application without an account', () => {
    it('refuses a reference that does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await expect(
        service.publicStatus('APP-2026-9999', '2013-04-02'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses the right reference with the wrong date of birth', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      await expect(
        service.publicStatus('APP-2026-0417', '2011-01-01'),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * The same message either way. Two different answers would let anybody
     * holding a reference number confirm a child's birthday by guessing.
     */
    it('gives the same answer for a wrong reference and a wrong date', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      const missing = await service
        .publicStatus('APP-2026-9999', '2013-04-02')
        .catch((e) => e.message);
      prisma.application.findUnique.mockResolvedValue(application());
      const wrongDob = await service
        .publicStatus('APP-2026-0417', '2011-01-01')
        .catch((e) => e.message);
      expect(missing).toBe(wrongDob);
    });

    /**
     * What a family is shown is deliberately narrow: their own progress and
     * their own offer. It carries the reason a decision was given, because
     * that is what they are owed, and nothing about anybody else.
     */
    it('tells the family where they are, in words they can act on', async () => {
      prisma.application.findUnique
        .mockResolvedValueOnce(application())
        .mockResolvedValueOnce({
          ...application(),
          intake: {
            entryPoint: 'SENIOR_ONE',
            name: 'Senior 1 intake, 2026',
            classLevel: { name: 'Senior 1' },
          },
          documents: [{ kind: 'BIRTH_CERTIFICATE', verifiedAt: new Date() }],
          offers: [{ expiresAt: new Date('2099-01-01'), isBoarder: true }],
          events: [
            {
              toStatus: 'REJECTED',
              createdAt: new Date('2026-06-10'),
              reason: 'Below the mark for this intake',
            },
          ],
        });
      const out = await service.publicStatus('APP-2026-0417', '2013-04-02');
      expect(out.applicant).toBe('Aline Uwase');
      /* Named the way a family will go looking for them, not by the enum. */
      expect(out.stillNeeded).toContain('Passport photograph');
      expect(out.history[0].reason).toBe('Below the mark for this intake');
      expect(out.offer).toBeTruthy();
    });

    it('says so when the application vanishes between the two reads', async () => {
      prisma.application.findUnique
        .mockResolvedValueOnce(application())
        .mockResolvedValueOnce(null);
      await expect(
        service.publicStatus('APP-2026-0417', '2013-04-02'),
      ).rejects.toThrow(NotFoundException);
    });

    it('reads a reference typed in lower case', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await service
        .publicStatus('app-2026-0417', '2013-04-02')
        .catch(() => null);
      expect(prisma.application.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reference: 'APP-2026-0417' } }),
      );
    });
  });

  // ── Becoming a student ────────────────────────────────────────────────

  describe('enrolling an accepted family', () => {
    beforeEach(() => {
      prisma.application.findUnique.mockResolvedValue(
        application({ status: 'ACCEPTED' }),
      );
      prisma.admissionOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        classSectionId: 'section-1',
        isBoarder: true,
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1' });
      prisma.student.findUnique.mockResolvedValue(null);
      prisma.student.create.mockResolvedValue({ id: 'student-1' });
      prisma.user.upsert.mockResolvedValue({
        id: 'parent-1',
        phone: '+250788100000',
      });
      prisma.parentStudent.create.mockResolvedValue({});
    });

    it('creates the user, the student and the parent link in one go', async () => {
      const result = await service.enrol('app-1', 'admin-1');
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.student.create).toHaveBeenCalled();
      expect(prisma.parentStudent.create).toHaveBeenCalled();
      expect(result.studentId).toBe('student-1');
    });

    it('does it all in one transaction, or none of it', async () => {
      await service.enrol('app-1', 'admin-1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('mints a student number in the house shape', async () => {
      const result = await service.enrol('app-1', 'admin-1');
      expect(result.studentIdNumber).toMatch(/^STD-\d{4}-/);
    });

    it('gives them the house address', async () => {
      const result = await service.enrol('app-1', 'admin-1');
      expect(result.email).toBe('a.uwase@markova.edu');
    });

    // Two students called A. Uwase cannot share an address.
    it('numbers the address when it is already taken', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'someone' })
        .mockResolvedValue(null);
      const result = await service.enrol('app-1', 'admin-1');
      expect(result.email).toBe('a.uwase2@markova.edu');
    });

    /**
     * Matched on phone rather than created blindly, so a second child from the
     * same family is linked to the parent already on the system.
     */
    it('links to the parent already on the system rather than duplicating them', async () => {
      await service.enrol('app-1', 'admin-1');
      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { phone: '+250788100000' } }),
      );
    });

    it('takes the class from the offer the family accepted', async () => {
      await service.enrol('app-1', 'admin-1');
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ classSectionId: 'section-1' }),
        }),
      );
    });

    it('carries the welfare answers onto the student record', async () => {
      prisma.application.findUnique.mockResolvedValue(
        application({
          status: 'ACCEPTED',
          bloodType: 'O+',
          allergies: 'Peanuts',
          district: 'Gasabo',
        }),
      );
      await service.enrol('app-1', 'admin-1');
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bloodType: 'O+',
            allergies: 'Peanuts',
            district: 'Gasabo',
          }),
        }),
      );
    });

    it('freezes the application against the student it became', async () => {
      await service.enrol('app-1', 'admin-1');
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ studentId: 'student-1' }),
        }),
      );
    });

    /**
     * The whole point of the offer being its own record. Enrolling somebody
     * who never accepted skips the family entirely.
     */
    it('refuses a family that has not accepted a place', async () => {
      prisma.application.findUnique.mockResolvedValue(
        application({ status: 'OFFERED' }),
      );
      await expect(service.enrol('app-1', 'admin-1')).rejects.toThrow(
        /accepted their place/i,
      );
    });

    it('refuses when there is no accepted offer to take a class from', async () => {
      prisma.admissionOffer.findFirst.mockResolvedValue(null);
      await expect(service.enrol('app-1', 'admin-1')).rejects.toThrow(
        /no accepted offer/i,
      );
    });
  });

  // ── Documents and notes ───────────────────────────────────────────────

  describe('documents', () => {
    it('records who checked one, and when', async () => {
      prisma.applicationDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        verifiedAt: null,
      });
      prisma.applicationDocument.update.mockResolvedValue({});
      await service.verifyDocument('doc-1', 'admin-1');
      expect(prisma.applicationDocument.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { verifiedAt: expect.any(Date), verifiedByUserId: 'admin-1' },
      });
    });

    it('refuses to check one twice', async () => {
      prisma.applicationDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        verifiedAt: new Date(),
      });
      await expect(service.verifyDocument('doc-1', 'a')).rejects.toThrow(
        /already been checked/i,
      );
    });

    it('files a document against the application it belongs to', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      prisma.applicationDocument.create.mockResolvedValue({ id: 'doc-9' });
      await service.attachDocument(
        'app-1',
        'PASSPORT_PHOTO',
        '/uploads/admissions/photo.png',
        'photo.png',
      );
      expect(prisma.applicationDocument.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          kind: 'PASSPORT_PHOTO',
          fileUrl: '/uploads/admissions/photo.png',
          fileName: 'photo.png',
        },
      });
    });

    it('refuses a document for an application that is not there', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await expect(
        service.attachDocument('nope', 'PASSPORT_PHOTO', '/f', 'f'),
      ).rejects.toThrow(NotFoundException);
    });

    it('says so when the document is not there', async () => {
      prisma.applicationDocument.findUnique.mockResolvedValue(null);
      await expect(service.verifyDocument('nope', 'a')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('internal notes', () => {
    it('records the author', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      prisma.applicationNote.create.mockResolvedValue({});
      await service.addNote('app-1', 'Spoke to the mother', 'admin-1');
      expect(prisma.applicationNote.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          body: 'Spoke to the mother',
          authorUserId: 'admin-1',
        },
      });
    });

    it('refuses an empty one', async () => {
      prisma.application.findUnique.mockResolvedValue(application());
      await expect(service.addNote('app-1', '   ', 'a')).rejects.toThrow(
        /write something/i,
      );
    });
  });

  // ── The desk ──────────────────────────────────────────────────────────

  describe('the queue', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'app-1',
      status: 'SUBMITTED',
      isBoarder: false,
      funding: 'FAMILY',
      submittedAt: new Date('2026-06-01'),
      intake: { entryPoint: 'SENIOR_ONE', classLevel: { name: 'Senior 1' } },
      documents: [],
      offers: [],
      events: [],
      ...over,
    });

    it('works out how complete each one is', async () => {
      prisma.application.findMany.mockResolvedValue([
        row({
          documents: [
            { kind: 'BIRTH_CERTIFICATE', verifiedAt: new Date() },
            { kind: 'PASSPORT_PHOTO', verifiedAt: null },
          ],
        }),
      ]);
      const result = await service.queue({});
      expect(result.data[0].completeness).toMatchObject({
        complete: false,
        missing: ['NATIONAL_EXAM_RESULT', 'PREVIOUS_REPORT_CARD', 'PARENT_ID'],
      });
    });

    /**
     * The family who has waited longest is the one the school owes an answer
     * to. The same lesson the fee register learned.
     */
    it('asks the database for the oldest first', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      await service.queue({});
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { submittedAt: 'asc' } }),
      );
    });

    /*
      The tabs are questions a reviewer asks, not a taxonomy. "Needs a
      decision" is where a submitted and a picked-up application both sit.
    */
    it('groups the states into the piles a reviewer thinks in', async () => {
      prisma.application.findMany.mockResolvedValue([
        row({ status: 'SUBMITTED' }),
        row({ status: 'UNDER_REVIEW' }),
        row({ status: 'INFO_REQUESTED' }),
        row({ status: 'REJECTED' }),
      ]);
      const result = await service.queue({});
      expect(result.buckets).toEqual({ TO_DECIDE: 2, WAITING: 1, DECIDED: 1 });
    });

    it('narrows to one pile when asked', async () => {
      prisma.application.findMany.mockResolvedValue([
        row({ status: 'SUBMITTED' }),
        row({ status: 'REJECTED' }),
      ]);
      const result = await service.queue({ bucket: 'TO_DECIDE' });
      expect(result.total).toBe(1);
      expect(result.data[0].status).toBe('SUBMITTED');
    });

    it('searches a reference, a name or the guardian phone', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      await service.queue({ search: 'Uwase' });
      expect(
        JSON.stringify(prisma.application.findMany.mock.calls[0][0].where),
      ).toContain('Uwase');
    });

    it('pages through the pile', async () => {
      prisma.application.findMany.mockResolvedValue([row(), row(), row()]);
      const result = await service.queue({ page: 2, limit: 2 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
    });
  });

  /**
   * Shown to the reviewer as they work rather than discovered at enrolment,
   * when the transaction would fail on a unique constraint with the family
   * already told they had a place.
   */
  describe('duplicates', () => {
    it('reports the same child applying twice, and a child already on the roll', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...application(),
        documents: [],
        events: [],
        notes: [],
        offers: [],
        intake: { ...OPEN_INTAKE, classLevel: {}, academicYear: {} },
      });
      prisma.application.findMany
        .mockResolvedValueOnce([{ id: 'app-9', reference: 'APP-2026-0100' }])
        .mockResolvedValueOnce([{ id: 'app-8', reference: 'APP-2026-0101' }]);
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-9',
        studentIdNumber: 'STD-2025-0001',
      });

      const result = await service.one('app-1');
      expect(result.duplicates.sameChild).toHaveLength(1);
      expect(result.duplicates.sameGuardian).toHaveLength(1);
      expect(result.duplicates.alreadyStudent).toMatchObject({
        studentIdNumber: 'STD-2025-0001',
      });
    });
  });

  // ── Intakes ───────────────────────────────────────────────────────────

  describe('intakes', () => {
    it('reports how many places are left, offers included', async () => {
      prisma.admissionIntake.findMany.mockResolvedValue([
        { id: 'intake-1', places: 40, academicYear: {}, classLevel: {} },
      ]);
      prisma.application.groupBy.mockResolvedValue([
        { status: 'OFFERED', _count: { _all: 6 } },
        { status: 'ENROLLED', _count: { _all: 10 } },
        { status: 'REJECTED', _count: { _all: 30 } },
      ]);
      const [intake] = await service.intakes();
      expect(intake.placesLeft).toBe(24);
      expect(intake.total).toBe(46);
    });

    /**
     * The public list. A round a family cannot apply to today has no business
     * on the form, whether it has not opened yet or has already closed.
     */
    it('offers a family only the rounds open today', async () => {
      prisma.admissionIntake.findMany.mockResolvedValue([]);
      await service.openIntakes();
      expect(prisma.admissionIntake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isOpen: true,
            opensAt: { lte: expect.any(Date) },
            closesAt: { gte: expect.any(Date) },
          }),
        }),
      );
    });

    it('refuses a round that closes before it opens', async () => {
      await expect(
        service.saveIntake({
          academicYearId: 'y',
          classLevelId: 'l',
          entryPoint: 'SENIOR_ONE',
          name: 'x',
          places: 40,
          opensAt: '2026-08-01',
          closesAt: '2026-06-01',
        }),
      ).rejects.toThrow(/close before it opens/i);
    });

    it('says so when the round being changed is gone', async () => {
      prisma.admissionIntake.findUnique.mockResolvedValue(null);
      await expect(
        service.saveIntake({
          id: 'nope',
          academicYearId: 'y',
          classLevelId: 'l',
          entryPoint: 'SENIOR_ONE',
          name: 'x',
          places: 40,
          opensAt: '2026-06-01',
          closesAt: '2026-08-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * The honeypot on the public form.
   *
   * A field a person cannot see, so a person cannot fill it in. A commodity
   * bot walks the DOM and fills everything, because filling everything is what
   * it does.
   *
   * Chosen over a CAPTCHA on purpose: this form is filled in by parents on
   * phones on a poor connection, and a CAPTCHA is a real barrier for exactly
   * the families a school most wants to reach. It would also mean a request to
   * a third party on every application from a system holding children's data.
   */
  describe('an application that filled the hidden field', () => {
    it('is not written to the database at all', async () => {
      await service.submit({
        intakeId: 'intake-1',
        addressLine2: 'https://buy-cheap-things.example',
      } as never);
      expect(prisma.application.create).not.toHaveBeenCalled();
    });

    /*
      Answers as though it worked. Refusing plainly would tell whoever wrote
      the bot which field gave them away, and they would remove it and try
      again.
    */
    it('answers as though it had been accepted', async () => {
      const out = await service.submit({
        intakeId: 'intake-1',
        addressLine2: 'spam',
      } as never);
      expect(out.reference).toMatch(/^APP-\d{4}-/);
      expect(out.status).toBe('SUBMITTED');
    });

    it('does not even look the intake up', async () => {
      await service.submit({
        intakeId: 'intake-1',
        addressLine2: 'spam',
      } as never);
      expect(prisma.admissionIntake.findUnique).not.toHaveBeenCalled();
    });

    /* A real family leaves it empty, and a browser that sends an empty string
       for an untouched input must not be treated as a bot. */
    it('lets a real application through when the field is empty', async () => {
      await expect(
        service.submit({ intakeId: 'missing', addressLine2: '' } as never),
      ).rejects.toThrow();
      expect(prisma.admissionIntake.findUnique).toHaveBeenCalled();
    });

    it('lets one through when the field is absent entirely', async () => {
      await expect(
        service.submit({ intakeId: 'missing' } as never),
      ).rejects.toThrow();
      expect(prisma.admissionIntake.findUnique).toHaveBeenCalled();
    });
  });
});
