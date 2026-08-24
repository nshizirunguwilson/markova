import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * What goes on a report card, and what the sheet looks like once it does.
 *
 * A report card is the single most consequential document a school hands a
 * family. Everything here is either a number a parent will act on, or text
 * that came from somewhere a person typed and is about to be rendered into
 * HTML somebody's browser will run.
 */
describe('report card data', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    classSectionId: 'section-1',
    gender: 'FEMALE',
    dateOfBirth: new Date('2010-04-02'),
    disciplinePoints: 92,
    enrollmentDate: new Date('2024-01-15'),
    user: {
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      photoUrl: '/p.jpg',
      email: 'd.niyonkuru@markova.edu',
      phone: null,
    },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', stage: 'O_LEVEL', order: 1 },
      trade: null,
    },
  };

  const term = {
    id: 'term-1',
    name: 'Term 3',
    startDate: new Date('2026-04-20'),
    endDate: new Date('2026-08-26'),
    academicYear: { name: '2026' },
  };

  const mark = (subject: string, type: string, score: number) => ({
    subjectId: subject,
    score,
    maxScore: 20,
    subject: { name: subject, scope: 'O_CORE' },
    assessmentType: { name: type },
    termId: 'term-1',
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);

    prisma.student.findUnique.mockResolvedValue(student);
    prisma.term.findUnique.mockResolvedValue(term);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
      { key: 'school_address', value: 'Kigali, Rwanda' },
      { key: 'primary_color', value: '#1B4F72' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
    prisma.reportVerification.create.mockImplementation((args: any) =>
      Promise.resolve({ ...args.data, createdAt: new Date('2026-08-01') }),
    );
  });

  describe('who and when', () => {
    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.getTermReportData('nobody', 'term-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a term that does not exist', async () => {
      prisma.term.findUnique.mockResolvedValue(null);
      await expect(
        service.getTermReportData('student-1', 'nope'),
      ).rejects.toThrow(NotFoundException);
    });

    it('names the student, the class and the year', async () => {
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.student).toMatchObject({
        name: 'Divine Niyonkuru',
        studentIdNumber: 'STD-2026-001',
        class: 'Senior 1 A',
        stage: 'O_LEVEL',
      });
      expect(data.term).toEqual({ name: 'Term 3', academicYear: '2026' });
    });

    it('names the trade on a TVET card', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        classSection: {
          ...student.classSection,
          trade: { code: 'SWD', name: 'Software Development', sector: 'ICT' },
        },
      });
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.student.trade).toEqual({
        code: 'SWD',
        name: 'Software Development',
        sector: 'ICT',
      });
    });

    it('names the class teacher who signs it', async () => {
      prisma.teacherRole.findFirst.mockResolvedValue({
        teacher: { user: { firstName: 'Aline', lastName: 'Uwase' } },
      });
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.classTeacher).toBe('Aline Uwase');
    });

    it('leaves the signature line blank when the class has no teacher', async () => {
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.classTeacher).toBeNull();
    });
  });

  describe('attendance on the card', () => {
    /**
     * Counted inside the term's own dates. A figure covering the whole year
     * would say the same thing on all three cards a family receives.
     */
    it('counts only days inside the term', async () => {
      await service.getTermReportData('student-1', 'term-1');
      const where = prisma.attendance.count.mock.calls[0][0].where;
      expect(where.date).toEqual({ gte: term.startDate, lte: term.endDate });
    });

    // A child who arrived at all was in the building.
    it('counts a late arrival as present', async () => {
      await service.getTermReportData('student-1', 'term-1');
      const presentCall = prisma.attendance.count.mock.calls.find(
        (c) => c[0].where.status,
      );
      expect(presentCall![0].where.status).toEqual({
        in: ['PRESENT', 'LATE'],
      });
    });

    it('reports both halves of the fraction', async () => {
      prisma.attendance.count
        .mockResolvedValueOnce(60)
        .mockResolvedValueOnce(57);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.attendance).toEqual({ present: 57, total: 60 });
    });
  });

  describe('where the student stands in the class', () => {
    it('averages the class the student is actually in', async () => {
      prisma.termResult.findMany.mockResolvedValue([
        { average: 60 },
        { average: 80 },
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.classStats).toMatchObject({
        classAverage: 70,
        totalStudents: 2,
      });
      expect(prisma.termResult.findMany).toHaveBeenCalledWith({
        where: { classSectionId: 'section-1', termId: 'term-1' },
      });
    });

    // A class nobody has been marked in has no average, and printing 0 would
    // tell a family their child is bottom of a class that has no results.
    it('prints no class average rather than a zero', async () => {
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.classStats.classAverage).toBeNull();
    });

    it('counts a missing average as zero rather than dropping the student', async () => {
      prisma.termResult.findMany.mockResolvedValue([
        { average: 80 },
        { average: null },
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.classStats.classAverage).toBe(40);
      expect(data.classStats.totalStudents).toBe(2);
    });
  });

  /**
   * The code is what ties the printed sheet to the digital original, so it
   * only exists once a term has actually been worked out.
   */
  describe('the verification code', () => {
    it('is absent until the term has a result', async () => {
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.verification).toBeNull();
      expect(prisma.reportVerification.create).not.toHaveBeenCalled();
    });

    it('carries the code and the page it points at', async () => {
      prisma.termResult.findFirst.mockResolvedValue({ id: 'res-1', rank: 4 });
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.verification!.code).toMatch(/^\d{4}-\d{4}-\d{4}$/);
      expect(data.verification!.url).toContain(
        `/verify/${data.verification!.code}`,
      );
    });

    it('reuses the same code every time the card is printed', async () => {
      prisma.termResult.findFirst.mockResolvedValue({ id: 'res-1' });
      prisma.reportVerification.findUnique.mockResolvedValue({
        code: '1111-2222-3333',
        createdAt: new Date(),
      });

      const first = await service.getTermReportData('student-1', 'term-1');
      const second = await service.getTermReportData('student-1', 'term-1');
      expect(first.verification!.code).toBe(second.verification!.code);
    });
  });

  /**
   * Subjects are weighted with the same module the marks page uses, and
   * ordered the way a Rwandan report card reads: core, then electives.
   */
  describe('the subject table', () => {
    it('weighs the assessments into one total per subject', async () => {
      prisma.mark.findMany.mockResolvedValue([
        mark('Mathematics', 'CAT 1', 16),
        mark('Mathematics', 'End of Term Exam', 18),
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects).toHaveLength(1);
      expect(data.subjects[0].total).toBeGreaterThan(0);
      expect(data.subjects[0].grade).toBeTruthy();
    });

    it('shows every assessment behind the total', async () => {
      prisma.mark.findMany.mockResolvedValue([
        mark('Mathematics', 'CAT 1', 16),
        mark('Mathematics', 'CAT 2', 14),
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects[0].assessments).toEqual([
        { type: 'CAT 1', score: 16, maxScore: 20, pct: 80 },
        { type: 'CAT 2', score: 14, maxScore: 20, pct: 70 },
      ]);
    });

    it('puts core subjects before electives', async () => {
      prisma.mark.findMany.mockResolvedValue([
        {
          ...mark('Art', 'CAT 1', 15),
          subject: { name: 'Art', scope: 'O_ELECTIVE' },
        },
        mark('Mathematics', 'CAT 1', 15),
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects.map((s: any) => s.subject)).toEqual([
        'Mathematics',
        'Art',
      ]);
    });

    it('orders subjects of the same kind by name', async () => {
      prisma.mark.findMany.mockResolvedValue([
        mark('Physics', 'CAT 1', 15),
        mark('Biology', 'CAT 1', 15),
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects.map((s: any) => s.subject)).toEqual([
        'Biology',
        'Physics',
      ]);
    });

    // A TVET module is passed or not passed on the practical, separately from
    // the mark, which is how the national framework reads it.
    it('says whether a TVET module was reached, not just its mark', async () => {
      prisma.mark.findMany.mockResolvedValue([
        {
          ...mark('Web Development', 'Practical', 18),
          subject: { name: 'Web Development', scope: 'A_SPECIFIC' },
        },
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects[0].competence).toBe('COMPETENT');
    });

    it('says nothing about competence for an ordinary subject', async () => {
      prisma.mark.findMany.mockResolvedValue([
        mark('Mathematics', 'CAT 1', 15),
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects[0].competence).toBeNull();
    });

    // A mark under an assessment name nobody weights cannot produce a total,
    // and printing 0 would fail a student the school never assessed.
    it('leaves the total empty when nothing could be weighed', async () => {
      prisma.mark.findMany.mockResolvedValue([
        mark('Mathematics', 'Made-up assessment', 15),
      ]);
      const data = await service.getTermReportData('student-1', 'term-1');
      expect(data.subjects[0].total).toBeNull();
      expect(data.subjects[0].grade).toBeNull();
    });
  });
});

/**
 * The letters and certificates a school issues, and the sheets they print on.
 */
describe('documents', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    enrollmentDate: new Date('2024-01-15'),
    user: {
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      email: 'd@markova.edu',
      phone: null,
    },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1' },
      trade: null,
    },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    prisma.disciplineIncident.findMany.mockResolvedValue([]);
    prisma.termResult.findMany.mockResolvedValue([]);
  });

  it('refuses a student who does not exist', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(
      service.generateDocument('nobody', 'transfer_letter'),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a kind of document it does not issue', async () => {
    await expect(
      service.generateDocument('student-1', 'nonsense'),
    ).rejects.toThrow(NotFoundException);
  });

  /**
   * These are the exact wire values the web sends. All four were once sent in
   * upper case and every one of them 404'd, from the day they were written.
   */
  it.each([
    ['transfer_letter', 'Transfer Letter'],
    ['enrollment_confirmation', 'Enrollment Confirmation'],
    ['discipline_report', 'Discipline Report'],
    ['transcript', 'Transcript'],
  ])('issues a %s', async (type, heading) => {
    const doc = await service.generateDocument('student-1', type);
    expect(doc.title).toBe(`${heading} - Divine Niyonkuru`);
    expect(doc.html).toContain('Divine Niyonkuru');
  });

  it('names the student and their class in a transfer letter', async () => {
    const doc = await service.generateDocument('student-1', 'transfer_letter');
    expect(doc.html).toContain('STD-2026-001');
    expect(doc.html).toContain('Senior 1 A');
  });

  it('lists the incidents on a discipline report', async () => {
    prisma.disciplineIncident.findMany.mockResolvedValue([
      {
        date: new Date('2026-05-02'),
        description: 'Late to assembly',
        pointsDeducted: 5,
        actionTaken: 'VERBAL_WARNING',
        recordedBy: { firstName: 'Aline', lastName: 'Uwase' },
      },
    ]);
    const doc = await service.generateDocument(
      'student-1',
      'discipline_report',
    );
    expect(doc.html).toContain('Late to assembly');
    expect(prisma.disciplineIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { date: 'desc' } }),
    );
  });

  it('reads a transcript in the order the terms happened', async () => {
    await service.generateDocument('student-1', 'transcript');
    expect(prisma.termResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { term: { startDate: 'asc' } } }),
    );
  });

  /**
   * Every one of these fields was typed by a person into a form, and the
   * result is HTML a browser will run.
   */
  describe('text a person typed is never trusted', () => {
    const attack = '<script>alert(document.domain)</script>';

    it('escapes a name in a letter', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        user: { ...student.user, firstName: attack },
      });
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toContain('<script>');
      expect(doc.html).toContain('&lt;script&gt;');
    });

    it('escapes the school’s own name', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: attack },
      ]);
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toContain('<script>');
    });

    it('escapes an incident description', async () => {
      prisma.disciplineIncident.findMany.mockResolvedValue([
        {
          date: new Date('2026-05-02'),
          description: attack,
          pointsDeducted: 5,
          actionTaken: 'VERBAL_WARNING',
          recordedBy: { firstName: 'A', lastName: 'B' },
        },
      ]);
      const doc = await service.generateDocument(
        'student-1',
        'discipline_report',
      );
      expect(doc.html).not.toContain('<script>');
    });

    // A colour goes straight into a stylesheet, where `red;} body{...` would
    // rewrite the whole sheet.
    it('refuses a colour that is not a colour', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Markova' },
        { key: 'primary_color', value: 'red;}body{display:none}' },
      ]);
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toContain('display:none');
    });
  });
});

describe('ID card data', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    nfcCardId: null,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: '/p.jpg' },
    classSection: { name: 'A', classLevel: { name: 'Senior 1' }, trade: null },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
  });

  it('refuses a student who does not exist', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.generateIdCardData('nobody')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('carries the face, the name and the class', async () => {
    const data = await service.generateIdCardData('student-1');
    expect(data.student).toMatchObject({
      name: 'Divine Niyonkuru',
      studentIdNumber: 'STD-2026-001',
      photoUrl: '/p.jpg',
      class: 'Senior 1 A',
    });
  });

  // Before a card is issued there is no card number, and the student number
  // is the only thing a scanner could match on.
  it('falls back to the student number when no card is issued', async () => {
    const data = await service.generateIdCardData('student-1');
    expect(data.student.qrData).toBe('STD-2026-001');
  });

  it('encodes the card number once one exists', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...student,
      nfcCardId: '1111 2222 3333',
    });
    const data = await service.generateIdCardData('student-1');
    expect(data.student.qrData).toBe('1111 2222 3333');
  });

  it('builds a card for every student still in the class', async () => {
    prisma.student.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
    const result = await service.generateBulkIdCards('section-1');
    expect(result.count).toBe(2);
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classSectionId: 'section-1', status: 'ACTIVE' },
      }),
    );
  });
});
