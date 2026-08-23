import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { createMockPrisma } from '../../__test__/prisma-mock';
import { RedisService } from '../../redis/redis.service';

/**
 * The numbers a head teacher makes decisions on.
 *
 * These are all aggregate scans, and the risk in an aggregate is that it is
 * quietly wrong: a rate computed over the wrong denominator, a class counted
 * that has nobody in it, a cache that keeps answering after the data moved.
 * None of those raise an error, and a head teacher has no way to tell.
 */
describe('AnalyticsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let redis: { get: jest.Mock; set: jest.Mock };
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    service = new AnalyticsService(prisma, redis as unknown as RedisService);
  });

  /**
   * A Redis outage must never break analytics. Answering from a stale cache is
   * a choice; failing to answer at all is not.
   */
  describe('the cache in front of every aggregate', () => {
    it('answers from the cache without touching the database', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ totalStudents: 700 }));
      const result = await service.getAdminDashboard();
      expect(result).toEqual({ totalStudents: 700 });
      expect(prisma.student.count).not.toHaveBeenCalled();
    });

    it('computes and stores when the cache is empty', async () => {
      prisma.student.count.mockResolvedValue(760);
      prisma.teacher.count.mockResolvedValue(43);
      prisma.parentStudent.groupBy.mockResolvedValue([{}, {}]);
      prisma.classLevel.count.mockResolvedValue(6);
      prisma.user.count.mockResolvedValue(2000);
      prisma.subject.count.mockResolvedValue(20);

      const result = await service.getAdminDashboard();
      expect(result.totalStudents).toBe(760);
      expect(redis.set).toHaveBeenCalled();
    });

    it('computes anyway when Redis cannot be read', async () => {
      redis.get.mockRejectedValue(new Error('Connection refused'));
      prisma.student.count.mockResolvedValue(760);
      prisma.teacher.count.mockResolvedValue(43);
      prisma.parentStudent.groupBy.mockResolvedValue([]);
      prisma.classLevel.count.mockResolvedValue(6);
      prisma.user.count.mockResolvedValue(2000);
      prisma.subject.count.mockResolvedValue(20);

      await expect(service.getAdminDashboard()).resolves.toMatchObject({
        totalStudents: 760,
      });
    });

    it('answers anyway when Redis cannot be written', async () => {
      redis.set.mockRejectedValue(new Error('OOM'));
      prisma.student.count.mockResolvedValue(760);
      prisma.teacher.count.mockResolvedValue(43);
      prisma.parentStudent.groupBy.mockResolvedValue([]);
      prisma.classLevel.count.mockResolvedValue(6);
      prisma.user.count.mockResolvedValue(2000);
      prisma.subject.count.mockResolvedValue(20);

      await expect(service.getAdminDashboard()).resolves.toBeDefined();
    });

    // A year and a term change the answer, so they have to change the key.
    it('keys the cache by the scope asked for', async () => {
      prisma.student.count.mockResolvedValue(0);
      prisma.teacher.count.mockResolvedValue(0);
      prisma.parentStudent.groupBy.mockResolvedValue([]);
      prisma.classLevel.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(0);
      prisma.subject.count.mockResolvedValue(0);

      await service.getAdminDashboard('year-1', 'term-1');
      expect(redis.get).toHaveBeenCalledWith(
        'analytics:admin-dashboard:year-1:term-1',
      );
    });
  });

  describe('who is on the roll', () => {
    it('counts only students still enrolled', async () => {
      prisma.student.count.mockResolvedValue(760);
      prisma.teacher.count.mockResolvedValue(43);
      prisma.parentStudent.groupBy.mockResolvedValue([]);
      prisma.classLevel.count.mockResolvedValue(6);
      prisma.user.count.mockResolvedValue(2000);
      prisma.subject.count.mockResolvedValue(20);

      await service.getAdminDashboard();
      expect(prisma.student.count).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
    });

    // A parent of three children is one parent. Counting the links would
    // report a school with far more families than it has.
    it('counts a parent of three children once', async () => {
      prisma.student.count.mockResolvedValue(0);
      prisma.teacher.count.mockResolvedValue(0);
      prisma.parentStudent.groupBy.mockResolvedValue([
        { parentUserId: 'p-1' },
        { parentUserId: 'p-2' },
      ]);
      prisma.classLevel.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(0);
      prisma.subject.count.mockResolvedValue(0);

      const result = await service.getAdminDashboard();
      expect(result.totalParents).toBe(2);
      expect(prisma.parentStudent.groupBy).toHaveBeenCalledWith({
        by: ['parentUserId'],
      });
    });
  });

  describe('performance across a year', () => {
    it('averages each term and says how many it covered', async () => {
      prisma.term.findMany.mockResolvedValue([
        { id: 'term-1', name: 'Term 1' },
        { id: 'term-2', name: 'Term 2' },
      ]);
      prisma.termResult.findMany
        .mockResolvedValueOnce([{ average: 60 }, { average: 70 }])
        .mockResolvedValueOnce([{ average: 80 }]);

      const trends = await service.getPerformanceTrends('year-1');
      expect(trends).toEqual([
        { termId: 'term-1', termName: 'Term 1', averageScore: 65, studentCount: 2 },
        { termId: 'term-2', termName: 'Term 2', averageScore: 80, studentCount: 1 },
      ]);
    });

    // A term nobody has been marked in yet is 0, not a crash and not NaN.
    it('reports a term with no results as zero rather than dividing by it', async () => {
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1', name: 'Term 1' }]);
      prisma.termResult.findMany.mockResolvedValue([]);

      const trends = await service.getPerformanceTrends('year-1');
      expect(trends[0].averageScore) .toBe(0);
    });

    it('counts a missing average as zero rather than skipping the student', async () => {
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1', name: 'Term 1' }]);
      prisma.termResult.findMany.mockResolvedValue([
        { average: 80 },
        { average: null },
      ]);

      const trends = await service.getPerformanceTrends('year-1');
      expect(trends[0].averageScore).toBe(40);
      expect(trends[0].studentCount).toBe(2);
    });

    it('reads the terms in the order they happen', async () => {
      prisma.term.findMany.mockResolvedValue([]);
      await service.getPerformanceTrends('year-1');
      expect(prisma.term.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startDate: 'asc' } }),
      );
    });
  });

  describe('class against class', () => {
    const sections = [
      { id: 'section-1', name: 'A', classLevel: { name: 'Senior 1' }, trade: null },
      { id: 'section-2', name: 'B', classLevel: { name: 'Senior 1' }, trade: null },
    ];

    it('ranks the classes best first', async () => {
      prisma.classSection.findMany.mockResolvedValue(sections);
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      prisma.termResult.findMany
        .mockResolvedValueOnce([{ average: 50 }, { average: 60 }])
        .mockResolvedValueOnce([{ average: 80 }, { average: 90 }]);

      const result = await service.getClassComparisons('term-1');
      expect(result.map((c) => c.className)).toEqual([
        'Senior 1 B',
        'Senior 1 A',
      ]);
      expect(result[0].averageScore).toBe(85);
      expect(result[0].highest).toBe(90);
      expect(result[0].lowest).toBe(80);
    });

    // An empty class in the comparison would show as a zero-scoring class and
    // drag the whole chart, which is a lie about a room with nobody in it.
    it('leaves out a class with nobody enrolled', async () => {
      prisma.classSection.findMany.mockResolvedValue([sections[0]]);
      prisma.student.findMany.mockResolvedValue([]);

      await expect(service.getClassComparisons('term-1')).resolves.toEqual([]);
      expect(prisma.termResult.findMany).not.toHaveBeenCalled();
    });

    it('leaves out a class nobody has been marked in yet', async () => {
      prisma.classSection.findMany.mockResolvedValue([sections[0]]);
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.termResult.findMany.mockResolvedValue([{ average: null }]);

      await expect(service.getClassComparisons('term-1')).resolves.toEqual([]);
    });
  });

  describe('discipline across the school', () => {
    it('counts the incidents by what was decided', async () => {
      prisma.disciplineIncident.findMany.mockResolvedValue([
        { actionTaken: 'VERBAL_WARNING' },
        { actionTaken: 'VERBAL_WARNING' },
        { actionTaken: 'SUSPENSION' },
      ]);

      const stats = await service.getDisciplineStats();
      expect(stats.totalIncidents).toBe(3);
      expect(stats.byAction).toEqual([
        { name: 'VERBAL_WARNING', count: 2 },
        { name: 'SUSPENSION', count: 1 },
      ]);
    });

    it('narrows to the terms in a year when one is named', async () => {
      prisma.term.findMany.mockResolvedValue([{ id: 't-1' }, { id: 't-2' }]);
      prisma.disciplineIncident.findMany.mockResolvedValue([]);

      await service.getDisciplineStats('year-1');
      expect(prisma.disciplineIncident.findMany).toHaveBeenCalledWith({
        where: { termId: { in: ['t-1', 't-2'] } },
      });
    });

    // A year with no terms would otherwise narrow to nothing and report zero
    // incidents for a school that had plenty.
    it('does not narrow to nothing when a year has no terms', async () => {
      prisma.term.findMany.mockResolvedValue([]);
      prisma.disciplineIncident.findMany.mockResolvedValue([{ actionTaken: 'X' }]);

      const stats = await service.getDisciplineStats('year-1');
      expect(prisma.disciplineIncident.findMany).toHaveBeenCalledWith({ where: {} });
      expect(stats.totalIncidents).toBe(1);
    });
  });

  describe('the library', () => {
    beforeEach(() => {
      prisma.book.count.mockResolvedValue(56);
      prisma.bookLoan.count.mockResolvedValue(172);
      prisma.bookLoan.groupBy.mockResolvedValue([]);
      prisma.book.findMany.mockResolvedValue([]);
    });

    /**
     * Loans stay ACTIVE past their due date; there is no OVERDUE transition.
     * Counting a status instead of a date would report nothing overdue, ever.
     */
    it('counts overdue as still out and past its date', async () => {
      await service.getLibraryStats();
      const overdueCall = prisma.bookLoan.count.mock.calls.find(
        (c) => c[0]?.where?.dueDate,
      );
      expect(overdueCall![0].where).toMatchObject({ status: 'ACTIVE' });
      expect(overdueCall![0].where.dueDate.lt).toBeInstanceOf(Date);
    });

    it('names the most borrowed titles rather than listing their ids', async () => {
      prisma.bookLoan.groupBy.mockResolvedValue([
        { bookId: 'book-1', _count: { id: 9 } },
      ]);
      prisma.book.findMany.mockResolvedValue([
        { id: 'book-1', title: 'Things Fall Apart', author: 'Achebe' },
      ]);

      const stats = await service.getLibraryStats();
      expect(stats.popularBooks).toEqual([
        {
          id: 'book-1',
          title: 'Things Fall Apart',
          author: 'Achebe',
          loanCount: 9,
        },
      ]);
    });
  });

  describe('attendance across the school', () => {
    const day = (iso: string, status: string) => ({
      date: new Date(iso),
      status,
    });

    it('reports the rate over every record, not over the present ones', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        day('2026-08-20', 'PRESENT'),
        day('2026-08-20', 'PRESENT'),
        day('2026-08-20', 'ABSENT'),
        day('2026-08-20', 'LATE'),
      ]);

      const stats = await service.getAttendanceStats();
      expect(stats).toMatchObject({
        totalRecords: 4,
        present: 2,
        absent: 1,
        late: 1,
        attendanceRate: 50,
      });
    });

    it('reports zero rather than dividing by no records at all', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      const stats = await service.getAttendanceStats();
      expect(stats.attendanceRate).toBe(0);
      expect(stats.byDate).toEqual([]);
    });

    it('groups the days in order for the trend line', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        day('2026-08-21', 'PRESENT'),
        day('2026-08-20', 'ABSENT'),
        day('2026-08-20', 'LATE'),
      ]);

      const stats = await service.getAttendanceStats();
      expect(stats.byDate).toEqual([
        { date: '2026-08-20', present: 0, late: 1, absent: 1 },
        { date: '2026-08-21', present: 1, late: 0, absent: 0 },
      ]);
    });

    it('narrows to the dates a term actually covers', async () => {
      const start = new Date('2026-04-20');
      const end = new Date('2026-08-26');
      prisma.term.findUnique.mockResolvedValue({ startDate: start, endDate: end });
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.getAttendanceStats('term-1');
      expect(prisma.attendance.findMany).toHaveBeenCalledWith({
        where: { date: { gte: start, lte: end } },
      });
    });

    it('reads everything when the term named does not exist', async () => {
      prisma.term.findUnique.mockResolvedValue(null);
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.getAttendanceStats('nope');
      expect(prisma.attendance.findMany).toHaveBeenCalledWith({ where: {} });
    });
  });

  describe('the spread of grades', () => {
    it('counts the letters per year level, in school order', async () => {
      prisma.termResult.findMany.mockResolvedValue([
        {
          letterGrade: 'A',
          classSection: { classLevel: { name: 'Senior 2', order: 2 } },
        },
        {
          letterGrade: 'B',
          classSection: { classLevel: { name: 'Senior 1', order: 1 } },
        },
        {
          letterGrade: 'B',
          classSection: { classLevel: { name: 'Senior 1', order: 1 } },
        },
      ]);

      const result = await service.getGradeDistribution('term-1');
      expect(result).toEqual([
        { level: 'Senior 1', total: 2, counts: { B: 2 } },
        { level: 'Senior 2', total: 1, counts: { A: 1 } },
      ]);
    });

    // A result with no letter is a term that has not been worked out yet, and
    // counting it would put a blank column on the heatmap.
    it('asks only for results that carry a grade', async () => {
      prisma.termResult.findMany.mockResolvedValue([]);
      await service.getGradeDistribution('term-1');
      expect(prisma.termResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { termId: 'term-1', letterGrade: { not: null } },
        }),
      );
    });
  });

  describe('who is enrolled', () => {
    it('splits each year level by gender, in school order', async () => {
      prisma.student.findMany.mockResolvedValue([
        { gender: 'MALE', classSection: { classLevel: { name: 'Senior 2', order: 2 } } },
        { gender: 'FEMALE', classSection: { classLevel: { name: 'Senior 1', order: 1 } } },
        { gender: 'FEMALE', classSection: { classLevel: { name: 'Senior 1', order: 1 } } },
      ]);

      const result = await service.getEnrollmentBreakdown();
      expect(result).toEqual([
        { level: 'Senior 1', male: 0, female: 2 },
        { level: 'Senior 2', male: 1, female: 0 },
      ]);
    });

    // A student with no gender recorded still belongs to the level; dropping
    // the row would make the totals disagree with the roll.
    it('keeps a level whose students have no gender on record', async () => {
      prisma.student.findMany.mockResolvedValue([
        { gender: null, classSection: { classLevel: { name: 'Senior 1', order: 1 } } },
      ]);

      const result = await service.getEnrollmentBreakdown();
      expect(result).toEqual([{ level: 'Senior 1', male: 0, female: 0 }]);
    });

    it('counts only students still enrolled', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.getEnrollmentBreakdown();
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      );
    });
  });

});

/**
 * One student's whole record, the page a class teacher opens before a parents
 * evening. Every number on it is a comparison, and a comparison against the
 * wrong group is worse than no comparison at all.
 */
describe('one student’s profile', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AnalyticsService;

  const term = (id: string, name: string, start: string) => ({
    id,
    name,
    startDate: new Date(start),
    endDate: new Date(start.replace(/^(\d{4})-(\d{2})/, '$1-12')),
    academicYear: { name: '2026' },
  });

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    classSectionId: 'section-1',
    gender: 'FEMALE',
    status: 'ACTIVE',
    disciplinePoints: 92,
    user: {
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      email: 'd.niyonkuru@markova.edu',
      photoUrl: null,
    },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', stage: 'O_LEVEL' },
      trade: null,
    },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AnalyticsService(prisma, {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
    } as never);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.student.count.mockResolvedValue(32);
  });

  it('refuses a student who does not exist', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.getStudentProfileAnalytics('nobody')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('names the student and the class they are in now', async () => {
    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.student).toMatchObject({
      name: 'Divine Niyonkuru',
      class: 'Senior 1 A',
      classSize: 32,
      stage: 'O_LEVEL',
      trade: null,
    });
  });

  it('names the trade for a TVET student', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...student,
      classSection: {
        ...student.classSection,
        trade: { code: 'SWD', name: 'Software Development' },
      },
    });
    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.student.trade).toEqual({
      code: 'SWD',
      name: 'Software Development',
    });
  });

  it('has no terms to show for a student who has never been marked', async () => {
    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms).toEqual([]);
  });

  it('reads the terms in the order they happened', async () => {
    prisma.mark.findMany.mockResolvedValue([
      {
        score: 15,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: term('term-2', 'Term 2', '2026-05-01'),
      },
      {
        score: 12,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: term('term-1', 'Term 1', '2026-01-01'),
      },
    ]);

    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms.map((t: any) => t.termName)).toEqual([
      'Term 1',
      'Term 2',
    ]);
  });

  /**
   * A Senior 2 term must compare against that year's Senior 2 class, not
   * against whatever room the student sits in today.
   */
  it('compares each term against the class the student sat in that term', async () => {
    const t1 = term('term-1', 'Term 1', '2026-01-01');
    prisma.mark.findMany.mockResolvedValue([
      {
        score: 16,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: t1,
      },
    ]);
    prisma.termResult.findMany
      .mockResolvedValueOnce([
        {
          termId: 'term-1',
          classSectionId: 'old-section',
          average: 80,
          letterGrade: 'A',
          aggregate: 12,
          aggregateMax: 60,
          rank: 3,
          classSection: {
            name: 'B',
            classLevel: { name: 'Senior 2' },
            trade: null,
          },
        },
      ])
      .mockResolvedValueOnce([
        { termId: 'term-1', classSectionId: 'old-section', average: 80 },
        { termId: 'term-1', classSectionId: 'old-section', average: 60 },
      ]);

    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms[0]).toMatchObject({
      className: 'Senior 2 B',
      average: 80,
      rank: 3,
      classSize: 2,
      classAverage: 70,
    });
  });

  it('asks for no class averages at all when there are no results', async () => {
    await service.getStudentProfileAnalytics('student-1');
    // One call for the student's own results, and no second call for a
    // comparison that would have nothing to compare against.
    expect(prisma.termResult.findMany).toHaveBeenCalledTimes(1);
  });

  it('works out the letter when the term result did not carry one', async () => {
    const t1 = term('term-1', 'Term 1', '2026-01-01');
    prisma.mark.findMany.mockResolvedValue([
      {
        score: 16,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: t1,
      },
    ]);
    prisma.termResult.findMany
      .mockResolvedValueOnce([
        {
          termId: 'term-1',
          classSectionId: 'section-1',
          average: 82,
          letterGrade: null,
          classSection: student.classSection,
        },
      ])
      .mockResolvedValueOnce([]);

    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms[0].letterGrade).toBeTruthy();
  });

  /**
   * Attendance is per term, so it has to be filtered to the term's own dates.
   * Counting the whole year against one term would report the same figure
   * three times.
   */
  it('counts attendance only inside the term it belongs to', async () => {
    const t1 = { ...term('term-1', 'Term 1', '2026-01-01') };
    t1.startDate = new Date('2026-01-01');
    t1.endDate = new Date('2026-04-01');

    prisma.mark.findMany.mockResolvedValue([
      {
        score: 16,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: t1,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { date: new Date('2026-02-01'), status: 'PRESENT' },
      { date: new Date('2026-02-02'), status: 'ABSENT' },
      // Outside the term, and so none of its business.
      { date: new Date('2026-06-01'), status: 'ABSENT' },
    ]);

    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms[0].attendancePct).toBe(50);
  });

  // Late is present. A child who arrived at all was in the building.
  it('counts a late arrival as having been there', async () => {
    const t1 = { ...term('term-1', 'Term 1', '2026-01-01') };
    t1.startDate = new Date('2026-01-01');
    t1.endDate = new Date('2026-04-01');

    prisma.mark.findMany.mockResolvedValue([
      {
        score: 16,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: t1,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { date: new Date('2026-02-01'), status: 'LATE' },
      { date: new Date('2026-02-02'), status: 'PRESENT' },
    ]);

    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms[0].attendancePct).toBe(100);
  });

  it('says nothing rather than zero when a term has no register at all', async () => {
    prisma.mark.findMany.mockResolvedValue([
      {
        score: 16,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: term('term-1', 'Term 1', '2026-01-01'),
      },
    ]);
    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms[0].attendancePct).toBeNull();
  });

  it('ranks the subjects best first', async () => {
    const t1 = term('term-1', 'Term 1', '2026-01-01');
    prisma.mark.findMany.mockResolvedValue([
      {
        score: 8,
        maxScore: 20,
        subject: { name: 'Maths', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: t1,
      },
      {
        score: 19,
        maxScore: 20,
        subject: { name: 'English', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        term: t1,
      },
    ]);

    const profile = await service.getStudentProfileAnalytics('student-1');
    expect(profile.terms[0].subjects[0].name).toBe('English');
  });
});

/**
 * A teacher's own class. The guard here is the one that matters: without it
 * any teacher could read any class's results by knowing its id.
 */
describe('a teacher’s class', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AnalyticsService(prisma, {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
    } as never);
    prisma.student.findMany.mockResolvedValue([{ id: 's-1', user: {} }]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findMany.mockResolvedValue([]);
  });

  it('refuses a class the teacher is not assigned to', async () => {
    prisma.teacherSubjectClass.findMany.mockResolvedValue([]);
    await expect(
      service.getTeacherClassAnalytics('teacher-1', 'section-9', 'term-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('summarises each subject they teach that class', async () => {
    prisma.teacherSubjectClass.findMany.mockResolvedValue([
      { subjectId: 'subject-1', subject: { name: 'Mathematics' } },
    ]);
    prisma.mark.findMany.mockResolvedValue([
      { score: 12 },
      { score: 18 },
      { score: 15 },
    ]);

    const result = await service.getTeacherClassAnalytics(
      'teacher-1',
      'section-1',
      'term-1',
    );
    expect(result.subjectAnalytics[0]).toEqual({
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
      averageScore: 15,
      highestScore: 18,
      lowestScore: 12,
      totalMarks: 3,
    });
  });

  // A subject with no marks yet would otherwise report a highest of -Infinity.
  it('leaves out a subject nobody has been marked in', async () => {
    prisma.teacherSubjectClass.findMany.mockResolvedValue([
      { subjectId: 'subject-1', subject: { name: 'Mathematics' } },
    ]);
    prisma.mark.findMany.mockResolvedValue([]);

    const result = await service.getTeacherClassAnalytics(
      'teacher-1',
      'section-1',
      'term-1',
    );
    expect(result.subjectAnalytics).toEqual([]);
  });

  /**
   * The list a teacher acts on. Worst first, and capped, because a list of
   * forty names is a list nobody works through.
   */
  it('names who is struggling, worst first', async () => {
    prisma.teacherSubjectClass.findMany.mockResolvedValue([
      { subjectId: 'subject-1', subject: { name: 'Mathematics' } },
    ]);
    prisma.termResult.findMany.mockResolvedValue([
      {
        studentId: 's-1',
        average: 45,
        letterGrade: 'D',
        student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
      },
      {
        studentId: 's-2',
        average: 30,
        letterGrade: 'F',
        student: { user: { firstName: 'Keza', lastName: 'Mutesi' } },
      },
      {
        studentId: 's-3',
        average: 72,
        letterGrade: 'B',
        student: { user: { firstName: 'Fine', lastName: 'Student' } },
      },
    ]);

    const result = await service.getTeacherClassAnalytics(
      'teacher-1',
      'section-1',
      'term-1',
    );
    expect(result.underperforming.map((u: any) => u.name)).toEqual([
      'Keza Mutesi',
      'Divine Niyonkuru',
    ]);
  });

  it('shows at most ten names', async () => {
    prisma.teacherSubjectClass.findMany.mockResolvedValue([
      { subjectId: 'subject-1', subject: { name: 'Mathematics' } },
    ]);
    prisma.termResult.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        studentId: `s-${i}`,
        average: 10 + i,
        letterGrade: 'F',
        student: { user: { firstName: 'A', lastName: String(i) } },
      })),
    );

    const result = await service.getTeacherClassAnalytics(
      'teacher-1',
      'section-1',
      'term-1',
    );
    expect(result.underperforming).toHaveLength(10);
  });

  // A student with no average at all is not passing; treating null as 0 is
  // what puts them on the list rather than quietly off it.
  it('treats a missing average as failing rather than skipping the student', async () => {
    prisma.teacherSubjectClass.findMany.mockResolvedValue([
      { subjectId: 'subject-1', subject: { name: 'Mathematics' } },
    ]);
    prisma.termResult.findMany.mockResolvedValue([
      {
        studentId: 's-1',
        average: null,
        letterGrade: null,
        student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
      },
    ]);

    const result = await service.getTeacherClassAnalytics(
      'teacher-1',
      'section-1',
      'term-1',
    );
    expect(result.underperforming).toHaveLength(1);
  });
});

describe('a student’s own numbers', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AnalyticsService(prisma, {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
    } as never);
    prisma.student.findUnique.mockResolvedValue({
      id: 'student-1',
      classSectionId: 'section-1',
      classSection: { name: 'A' },
    });
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.student.findMany.mockResolvedValue([{ id: 'student-1' }]);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
  });

  it('answers with nothing for a student who does not exist', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.getStudentAnalytics('nobody', 'term-1')).resolves.toBeNull();
  });

  it('averages each subject across its marks', async () => {
    prisma.mark.findMany.mockResolvedValue([
      { subjectId: 'subject-1', score: 12, subject: { name: 'Maths' } },
      { subjectId: 'subject-1', score: 18, subject: { name: 'Maths' } },
    ]);

    const result = await service.getStudentAnalytics('student-1', 'term-1');
    expect(result!.subjects).toEqual([
      { subjectId: 'subject-1', subjectName: 'Maths', average: 15 },
    ]);
  });

  it('compares against the class, not the whole school', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 'student-1' },
      { id: 'student-2' },
    ]);
    prisma.termResult.findMany.mockResolvedValue([
      { average: 60 },
      { average: 80 },
    ]);
    prisma.termResult.findFirst.mockResolvedValue({ average: 60, rank: 2 });

    const result = await service.getStudentAnalytics('student-1', 'term-1');
    expect(result).toMatchObject({
      studentAverage: 60,
      classAverage: 70,
      rank: 2,
      totalStudents: 2,
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classSectionId: 'section-1', status: 'ACTIVE' },
      }),
    );
  });

  it('reports a class average of zero rather than dividing by nobody', async () => {
    prisma.termResult.findMany.mockResolvedValue([{ average: null }]);
    const result = await service.getStudentAnalytics('student-1', 'term-1');
    expect(result!.classAverage).toBe(0);
  });
});

describe('a parent’s view of the year', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AnalyticsService(prisma, {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
    } as never);
    prisma.attendance.findMany.mockResolvedValue([]);
  });

  it('lists every term in order, marked or not', async () => {
    prisma.term.findMany.mockResolvedValue([
      { id: 'term-1', name: 'Term 1' },
      { id: 'term-2', name: 'Term 2' },
    ]);
    prisma.termResult.findFirst
      .mockResolvedValueOnce({ average: 72, letterGrade: 'B', rank: 5 })
      .mockResolvedValueOnce(null);

    const result = await service.getParentChildTrends('student-1', 'year-1');
    expect(result.performanceTrends).toEqual([
      { termId: 'term-1', termName: 'Term 1', average: 72, letterGrade: 'B', rank: 5 },
      { termId: 'term-2', termName: 'Term 2', average: null, letterGrade: null, rank: null },
    ]);
  });

  it('summarises attendance over the whole year', async () => {
    prisma.term.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([
      { status: 'PRESENT' },
      { status: 'LATE' },
      { status: 'ABSENT' },
      { status: 'ABSENT' },
    ]);

    const result = await service.getParentChildTrends('student-1', 'year-1');
    expect(result.attendance).toEqual({
      totalDays: 4,
      presentDays: 2,
      absentDays: 2,
      rate: 50,
    });
  });

  it('reports zero rather than dividing by an empty register', async () => {
    prisma.term.findMany.mockResolvedValue([]);
    const result = await service.getParentChildTrends('student-1', 'year-1');
    expect(result.attendance.rate).toBe(0);
  });
});