import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AcademicService } from './academic.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The shape of the school year.
 *
 * Most of this is CRUD, and the tests worth having are the refusals. Deleting
 * a year cascades to every mark under it; two classes with the same name at
 * one level makes a register ambiguous; an A-Level class with no trade is not
 * a class a Rwandan TSS has. None of those raise errors on their own.
 */
describe('AcademicService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AcademicService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AcademicService(prisma);
  });

  // ── Years ─────────────────────────────────────────────────────────────────

  describe('academic years', () => {
    it('refuses a year that does not exist', async () => {
      prisma.academicYear.findUnique.mockResolvedValue(null);
      await expect(service.findYearById('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * One current year. Two would make every "this year" query ambiguous, and
     * the ambiguity would surface as marks landing in the wrong year.
     */
    it('stands the previous current year down when a new one is made current', async () => {
      prisma.academicYear.create.mockResolvedValue({});
      await service.createYear({
        name: '2027',
        startDate: '2027-01-01',
        endDate: '2027-12-01',
        isCurrent: true,
      });
      expect(prisma.academicYear.updateMany).toHaveBeenCalledWith({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    });

    it('leaves the current year alone when the new one is not current', async () => {
      prisma.academicYear.create.mockResolvedValue({});
      await service.createYear({
        name: '2027',
        startDate: '2027-01-01',
        endDate: '2027-12-01',
      });
      expect(prisma.academicYear.updateMany).not.toHaveBeenCalled();
    });

    it('stores the dates as dates, not as the strings they arrived as', async () => {
      prisma.academicYear.create.mockResolvedValue({});
      await service.createYear({
        name: '2027',
        startDate: '2027-01-01',
        endDate: '2027-12-01',
      });
      const data = prisma.academicYear.create.mock.calls[0][0].data;
      expect(data.startDate).toBeInstanceOf(Date);
      expect(data.endDate).toBeInstanceOf(Date);
    });

    it('changes only the fields that were sent', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1' });
      prisma.academicYear.update.mockResolvedValue({});
      await service.updateYear('year-1', { name: '2027 revised' });
      expect(prisma.academicYear.update.mock.calls[0][0].data).toEqual({
        name: '2027 revised',
      });
    });

    /**
     * Deleting a year cascades to its terms and every mark under them. A
     * school that loses three years of records to one click has lost its
     * ability to issue a transcript.
     */
    it('refuses to delete a year that has marks under it', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1' });
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1' }]);
      prisma.mark.count.mockResolvedValue(260096);
      prisma.yearResult.count.mockResolvedValue(0);

      await expect(service.deleteYear('year-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.academicYear.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a year that has results under it', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1' });
      prisma.term.findMany.mockResolvedValue([]);
      prisma.yearResult.count.mockResolvedValue(6867);

      await expect(service.deleteYear('year-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deletes an empty year', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1' });
      prisma.term.findMany.mockResolvedValue([]);
      prisma.yearResult.count.mockResolvedValue(0);
      prisma.academicYear.delete.mockResolvedValue({});

      await expect(service.deleteYear('year-1')).resolves.toMatchObject({
        message: 'Academic year deleted',
      });
    });

    it('does not go looking for marks in a year with no terms', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1' });
      prisma.term.findMany.mockResolvedValue([]);
      prisma.yearResult.count.mockResolvedValue(0);
      prisma.academicYear.delete.mockResolvedValue({});

      await service.deleteYear('year-1');
      expect(prisma.mark.count).not.toHaveBeenCalled();
    });
  });

  // ── Terms ─────────────────────────────────────────────────────────────────

  describe('terms', () => {
    it('refuses a term that does not exist', async () => {
      prisma.term.findUnique.mockResolvedValue(null);
      await expect(service.findTermById('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('stands the previous current term down when a new one is made current', async () => {
      prisma.term.create.mockResolvedValue({});
      await service.createTerm({
        academicYearId: 'year-1',
        name: 'Term 1',
        startDate: '2027-01-01',
        endDate: '2027-04-01',
        isCurrent: true,
      });
      expect(prisma.term.updateMany).toHaveBeenCalledWith({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    });

    it('reads the terms of a year in the order they happen', async () => {
      prisma.term.findMany.mockResolvedValue([]);
      await service.findAllTerms('year-1');
      expect(prisma.term.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { academicYearId: 'year-1' },
          orderBy: { startDate: 'asc' },
        }),
      );
    });

    /**
     * Closing a term is what stops marks being changed after a report card
     * went home. Closing one twice, or reopening one that was never closed,
     * is a sign somebody is looking at stale state.
     */
    it('closes a term and stands it down as current', async () => {
      prisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      prisma.term.update.mockResolvedValue({});
      await service.closeTerm('term-1');
      expect(prisma.term.update.mock.calls[0][0].data).toEqual({
        isClosed: true,
        isCurrent: false,
      });
    });

    it('refuses to close a term that is already closed', async () => {
      prisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: true,
      });
      await expect(service.closeTerm('term-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.term.update).not.toHaveBeenCalled();
    });

    it('reopens a closed term without making it current again', async () => {
      prisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: true,
      });
      prisma.term.update.mockResolvedValue({});
      await service.reopenTerm('term-1');
      expect(prisma.term.update.mock.calls[0][0].data).toEqual({
        isClosed: false,
      });
    });

    it('refuses to reopen a term that was never closed', async () => {
      prisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      await expect(service.reopenTerm('term-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to delete a term that has marks in it', async () => {
      prisma.term.findUnique.mockResolvedValue({ id: 'term-1' });
      prisma.mark.count.mockResolvedValue(4200);
      await expect(service.deleteTerm('term-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.term.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty term', async () => {
      prisma.term.findUnique.mockResolvedValue({ id: 'term-1' });
      prisma.mark.count.mockResolvedValue(0);
      prisma.term.delete.mockResolvedValue({});
      await expect(service.deleteTerm('term-1')).resolves.toMatchObject({
        message: 'Term deleted',
      });
    });
  });

  // ── Classes ───────────────────────────────────────────────────────────────

  /**
   * A Rwandan TSS runs O-Level as plain streams and A-Level entirely through
   * trades. A class on the wrong side of that line is not a class the school
   * has, and every timetable and register built on it would be wrong.
   */
  describe('classes', () => {
    const oLevel = { id: 'level-1', stage: 'O_LEVEL' };
    const aLevel = { id: 'level-4', stage: 'A_LEVEL' };

    beforeEach(() => {
      prisma.classSection.findFirst.mockResolvedValue(null);
      prisma.classSection.create.mockResolvedValue({});
      prisma.trade.findUnique.mockResolvedValue({ id: 'trade-1', code: 'SWD' });
    });

    it('refuses a class at a level that does not exist', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(null);
      await expect(
        service.createSection({ classLevelId: 'nope', name: 'A' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses an A-Level class with no trade', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(aLevel);
      await expect(
        service.createSection({ classLevelId: 'level-4', name: 'A' }),
      ).rejects.toThrow(/must belong to a trade/i);
    });

    it('refuses an O-Level class carrying a trade', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(oLevel);
      await expect(
        service.createSection({
          classLevelId: 'level-1',
          name: 'A',
          tradeId: 'trade-1',
        }),
      ).rejects.toThrow(/do not take trade sections/i);
    });

    it('refuses a trade that does not exist', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(aLevel);
      prisma.trade.findUnique.mockResolvedValue(null);
      await expect(
        service.createSection({
          classLevelId: 'level-4',
          name: 'A',
          tradeId: 'nope',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a plain O-Level stream', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(oLevel);
      await service.createSection({ classLevelId: 'level-1', name: 'A' });
      expect(prisma.classSection.create.mock.calls[0][0].data).toEqual({
        classLevelId: 'level-1',
        tradeId: null,
        name: 'A',
      });
    });

    it('creates an A-Level trade class', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(aLevel);
      await service.createSection({
        classLevelId: 'level-4',
        name: 'A',
        tradeId: 'trade-1',
      });
      expect(prisma.classSection.create.mock.calls[0][0].data.tradeId).toBe(
        'trade-1',
      );
    });

    /**
     * The database unique treats two NULL trades as distinct, so two O-Level
     * "Senior 1 A" classes would both be accepted there. This is the check
     * that actually stops it.
     */
    it('refuses a second class with the same name at the same level', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(oLevel);
      prisma.classSection.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createSection({ classLevelId: 'level-1', name: 'A' }),
      ).rejects.toThrow(/already exists at this level/i);
    });

    it('does not call a class a duplicate of itself when renaming it', async () => {
      prisma.classSection.findUnique.mockResolvedValue({
        id: 'section-1',
        classLevelId: 'level-1',
        tradeId: null,
        name: 'A',
      });
      prisma.classLevel.findUnique.mockResolvedValue(oLevel);
      prisma.classSection.update.mockResolvedValue({});

      await service.updateSection('section-1', { name: 'A' });
      expect(prisma.classSection.findFirst.mock.calls[0][0].where.id).toEqual({
        not: 'section-1',
      });
    });
  });

  // ── Subjects ──────────────────────────────────────────────────────────────

  /**
   * A trade module belongs to exactly one trade, and a general subject
   * belongs to none. Getting it the wrong way round puts Software Development
   * on a Senior 1 timetable.
   */
  describe('subjects', () => {
    beforeEach(() => {
      prisma.subject.findFirst.mockResolvedValue(null);
      prisma.subject.create.mockResolvedValue({});
    });

    it('refuses a trade module with no trade', async () => {
      await expect(
        service.createSubject({
          name: 'Web Development',
          scope: 'A_SPECIFIC',
        } as never),
      ).rejects.toThrow(/must belong to a trade/i);
    });

    it('refuses a general subject that carries a trade', async () => {
      await expect(
        service.createSubject({
          name: 'Mathematics',
          scope: 'O_CORE',
          tradeId: 'trade-1',
        } as never),
      ).rejects.toThrow(/only trade-specific modules/i);
    });

    it('treats a subject as core unless told otherwise', async () => {
      await service.createSubject({ name: 'Mathematics' });
      expect(prisma.subject.create.mock.calls[0][0].data.scope).toBe('O_CORE');
    });

    it('refuses a subject that already exists for that trade', async () => {
      prisma.subject.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createSubject({ name: 'Mathematics' }),
      ).rejects.toThrow(/already exists/i);
    });

    // Two trades can each have their own "Web Development"; only a repeat
    // within one trade is a duplicate.
    it('looks for a duplicate within the same trade only', async () => {
      await service.createSubject({
        name: 'Web Development',
        scope: 'A_SPECIFIC',
        tradeId: 'trade-1',
      } as never);
      expect(prisma.subject.findFirst.mock.calls[0][0].where).toEqual({
        name: 'Web Development',
        tradeId: 'trade-1',
      });
    });

    it('marks a subject out of a hundred unless told otherwise', async () => {
      await service.createSubject({ name: 'Mathematics' });
      expect(prisma.subject.create.mock.calls[0][0].data.maxMarks).toBe(100);
    });

    it('refuses to change a subject that does not exist', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expect(service.updateSubject('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('holds the trade rule when only the scope is being changed', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        scope: 'A_SPECIFIC',
        tradeId: 'trade-1',
      });
      await expect(
        service.updateSubject('subject-1', { scope: 'O_CORE' } as never),
      ).rejects.toThrow(/only trade-specific modules/i);
    });

    it('holds the trade rule when only the trade is being removed', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        scope: 'A_SPECIFIC',
        tradeId: 'trade-1',
      });
      await expect(
        service.updateSubject('subject-1', { tradeId: null }),
      ).rejects.toThrow(/must belong to a trade/i);
    });
  });

  // ── Who teaches what ──────────────────────────────────────────────────────

  describe('teacher assignments', () => {
    const assignment = {
      teacherId: 'teacher-1',
      subjectId: 'subject-1',
      classSectionId: 'section-1',
      academicYearId: 'year-1',
    };

    /**
     * The same teacher assigned twice to one subject in one class would show
     * the class twice on their timetable and double every load calculation.
     */
    it('refuses an assignment that already exists', async () => {
      prisma.teacherSubjectClass.findFirst.mockResolvedValue({
        id: 'existing',
      });
      await expect(service.createAssignment(assignment)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.teacherSubjectClass.create).not.toHaveBeenCalled();
    });

    it('creates one that does not', async () => {
      prisma.teacherSubjectClass.findFirst.mockResolvedValue(null);
      prisma.teacherSubjectClass.create.mockResolvedValue({});
      await service.createAssignment(assignment);
      expect(prisma.teacherSubjectClass.create).toHaveBeenCalled();
    });

    /**
     * A spreadsheet of assignments is imported in one go, and one bad row
     * must not throw the other thirty away. The row number is what makes the
     * error fixable.
     */
    it('imports the good rows and names the bad ones by number', async () => {
      prisma.teacherSubjectClass.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);
      prisma.teacherSubjectClass.create.mockResolvedValue({});

      const result = await service.bulkCreateAssignments({
        assignments: [assignment, assignment, assignment],
      });
      expect(result.created).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/^Row 2:/);
    });
  });

  // ── Timetable ─────────────────────────────────────────────────────────────

  describe('the timetable', () => {
    it('refuses to change a period that does not exist', async () => {
      prisma.timetable.findUnique.mockResolvedValue(null);
      await expect(service.updateTimetable('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete a period that does not exist', async () => {
      prisma.timetable.findUnique.mockResolvedValue(null);
      await expect(service.deleteTimetable('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    // Monday is day 1 and Sunday is day 0, so a falsy check would silently
    // refuse to move a period to Sunday.
    it('accepts day zero as a real day', async () => {
      prisma.timetable.findUnique.mockResolvedValue({ id: 'tt-1' });
      prisma.timetable.update.mockResolvedValue({});
      await service.updateTimetable('tt-1', { dayOfWeek: 0 });
      expect(prisma.timetable.update.mock.calls[0][0].data).toEqual({
        dayOfWeek: 0,
      });
    });

    it('accepts clearing the room', async () => {
      prisma.timetable.findUnique.mockResolvedValue({ id: 'tt-1' });
      prisma.timetable.update.mockResolvedValue({});
      await service.updateTimetable('tt-1', { room: '' });
      expect(prisma.timetable.update.mock.calls[0][0].data).toEqual({
        room: '',
      });
    });

    it('places the good periods and names the bad ones by number', async () => {
      prisma.timetable.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Clash at 08:00'))
        .mockResolvedValueOnce({});

      const result = await service.bulkCreateTimetable({
        entries: [{}, {}, {}] as never,
      });
      expect(result.created).toBe(2);
      expect(result.errors[0]).toMatch(/^Row 2: Clash at 08:00$/);
    });
  });

  // ── Levels and trades ─────────────────────────────────────────────────────

  /**
   * The Rwandan structure is fixed: Senior 1 to Senior 3, then the TVET
   * levels. A fourth O-Level year is not a thing a school can create, and
   * letting it be created would produce a level nothing else understands.
   */
  describe('year levels', () => {
    it('reads the levels in school order', async () => {
      prisma.classLevel.findMany.mockResolvedValue([]);
      await service.findAllClassLevels();
      expect(prisma.classLevel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { order: 'asc' } }),
      );
    });

    // Alumni keep their class link for the record, and counting them would
    // report a Senior 1 of ninety in a room that holds thirty.
    it('counts only enrolled students in each class', async () => {
      prisma.classLevel.findMany.mockResolvedValue([]);
      await service.findAllClassLevels();
      const include = prisma.classLevel.findMany.mock.calls[0][0].include;
      expect(include.sections.include._count.select.students).toEqual({
        where: { status: 'ACTIVE' },
      });
    });

    it('refuses a fourth O-Level year', async () => {
      prisma.classLevel.count.mockResolvedValue(3);
      await expect(
        service.createClassLevel({ name: 'Senior 4', order: 4 }),
      ).rejects.toThrow(/limited to 3 year levels/i);
      expect(prisma.classLevel.create).not.toHaveBeenCalled();
    });

    it('allows the third one', async () => {
      prisma.classLevel.count.mockResolvedValue(2);
      prisma.classLevel.create.mockResolvedValue({});
      await service.createClassLevel({ name: 'Senior 3', order: 3 });
      expect(prisma.classLevel.create).toHaveBeenCalled();
    });

    it('puts no such limit on the TVET levels', async () => {
      prisma.classLevel.create.mockResolvedValue({});
      await service.createClassLevel({
        name: 'Level 6',
        order: 6,
        stage: 'A_LEVEL',
      } as never);
      expect(prisma.classLevel.count).not.toHaveBeenCalled();
    });

    it('treats a level as O-Level unless told otherwise', async () => {
      prisma.classLevel.count.mockResolvedValue(0);
      prisma.classLevel.create.mockResolvedValue({});
      await service.createClassLevel({ name: 'Senior 1', order: 1 });
      expect(prisma.classLevel.create.mock.calls[0][0].data.stage).toBe(
        'O_LEVEL',
      );
    });

    it('refuses to change a level that does not exist', async () => {
      prisma.classLevel.findUnique.mockResolvedValue(null);
      await expect(service.updateClassLevel('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * Classes cascade with the level, but their students are protected, so a
     * level with anybody in it would surface as a raw 500 instead of an
     * answer somebody can act on.
     */
    it('refuses to delete a level that still has students', async () => {
      prisma.classLevel.findUnique.mockResolvedValue({
        id: 'level-1',
        _count: { sections: 2 },
      });
      prisma.student.count.mockResolvedValue(64);
      await expect(service.deleteClassLevel('level-1')).rejects.toThrow(
        /still has enrolled students/i,
      );
      expect(prisma.classLevel.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty level', async () => {
      prisma.classLevel.findUnique.mockResolvedValue({
        id: 'level-1',
        _count: { sections: 0 },
      });
      prisma.student.count.mockResolvedValue(0);
      prisma.classLevel.delete.mockResolvedValue({});
      await expect(service.deleteClassLevel('level-1')).resolves.toMatchObject({
        message: 'Class level deleted',
      });
    });

    it('refuses to delete a class that still has students', async () => {
      prisma.classSection.findUnique.mockResolvedValue({
        id: 'section-1',
        _count: { students: 32 },
      });
      await expect(service.deleteSection('section-1')).rejects.toThrow(
        /still has enrolled students/i,
      );
    });

    it('refuses to delete a class that does not exist', async () => {
      prisma.classSection.findUnique.mockResolvedValue(null);
      await expect(service.deleteSection('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('trades', () => {
    it('stores a code in upper case, trimmed', async () => {
      prisma.trade.findFirst.mockResolvedValue(null);
      prisma.trade.create.mockResolvedValue({});
      await service.createTrade({
        code: ' swd ',
        name: '  Software Development ',
        sector: ' ICT ',
      });
      expect(prisma.trade.create.mock.calls[0][0].data).toEqual({
        code: 'SWD',
        name: 'Software Development',
        sector: 'ICT',
      });
    });

    // Two trades sharing a code would make every class name ambiguous.
    it('refuses a trade whose code or name is already taken', async () => {
      prisma.trade.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createTrade({ code: 'SWD', name: 'Something', sector: 'ICT' }),
      ).rejects.toThrow(/already exists/i);
    });

    it('refuses to change a trade that does not exist', async () => {
      prisma.trade.findUnique.mockResolvedValue(null);
      await expect(service.updateTrade('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete a trade that still runs classes', async () => {
      prisma.trade.findUnique.mockResolvedValue({
        id: 'trade-1',
        _count: { sections: 4 },
      });
      await expect(service.deleteTrade('trade-1')).rejects.toThrow(
        /still has classes/i,
      );
    });

    /**
     * Deleting a trade takes its modules with it, and a module cascades to
     * every mark recorded against it. That is three years of a student's
     * record gone on one click.
     */
    it('refuses to delete a trade whose modules have marks', async () => {
      prisma.trade.findUnique.mockResolvedValue({
        id: 'trade-1',
        _count: { sections: 0 },
      });
      prisma.mark.count.mockResolvedValue(1200);
      await expect(service.deleteTrade('trade-1')).rejects.toThrow(
        /recorded marks/i,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('takes its modules with it when there is nothing recorded', async () => {
      prisma.trade.findUnique.mockResolvedValue({
        id: 'trade-1',
        _count: { sections: 0 },
      });
      prisma.mark.count.mockResolvedValue(0);
      await service.deleteTrade('trade-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.subject.deleteMany).toHaveBeenCalledWith({
        where: { tradeId: 'trade-1' },
      });
    });
  });

  /**
   * A subject cascades to every mark recorded for it. Deactivating is the
   * answer for a subject a school stopped teaching.
   */
  describe('removing a subject', () => {
    it('refuses when marks exist, and says what to do instead', async () => {
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1' });
      prisma.mark.count.mockResolvedValue(4000);
      await expect(service.deleteSubject('subject-1')).rejects.toThrow(
        /deactivate it instead/i,
      );
      expect(prisma.subject.delete).not.toHaveBeenCalled();
    });

    it('removes one nothing was ever recorded against', async () => {
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1' });
      prisma.mark.count.mockResolvedValue(0);
      prisma.subject.delete.mockResolvedValue({});
      await expect(service.deleteSubject('subject-1')).resolves.toMatchObject({
        message: 'Subject deleted',
      });
    });

    it('refuses one that does not exist', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expect(service.deleteSubject('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Exams ─────────────────────────────────────────────────────────────────

  describe('the exam timetable', () => {
    it('reads in the order the papers are sat', async () => {
      prisma.examSchedule.findMany.mockResolvedValue([]);
      await service.findExamSchedules();
      expect(prisma.examSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
        }),
      );
    });

    it('narrows to a class and a term when both are given', async () => {
      prisma.examSchedule.findMany.mockResolvedValue([]);
      await service.findExamSchedules('section-1', 'term-1');
      expect(prisma.examSchedule.findMany.mock.calls[0][0].where).toEqual({
        classSectionId: 'section-1',
        termId: 'term-1',
      });
    });

    it('stores the exam day as a date, not the string it arrived as', async () => {
      prisma.examSchedule.create.mockResolvedValue({});
      await service.createExamSchedule({
        classSectionId: 'section-1',
        subjectId: 'subject-1',
        termId: 'term-1',
        examDate: '2026-11-20',
        startTime: '08:00',
        endTime: '11:00',
      });
      expect(
        prisma.examSchedule.create.mock.calls[0][0].data.examDate,
      ).toBeInstanceOf(Date);
    });

    it('refuses to change a paper that does not exist', async () => {
      prisma.examSchedule.findUnique.mockResolvedValue(null);
      await expect(service.updateExamSchedule('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete a paper that does not exist', async () => {
      prisma.examSchedule.findUnique.mockResolvedValue(null);
      await expect(service.deleteExamSchedule('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('accepts clearing the room and the syllabus', async () => {
      prisma.examSchedule.findUnique.mockResolvedValue({ id: 'ex-1' });
      prisma.examSchedule.update.mockResolvedValue({});
      await service.updateExamSchedule('ex-1', { room: '', syllabus: '' });
      expect(prisma.examSchedule.update.mock.calls[0][0].data).toEqual({
        room: '',
        syllabus: '',
      });
    });

    it('places the good papers and names the bad ones by number', async () => {
      prisma.examSchedule.create
        .mockRejectedValueOnce(new Error('Room double booked'))
        .mockResolvedValue({});

      const result = await service.bulkCreateExamSchedules({
        entries: [{}, {}] as never,
      });
      expect(result.created).toBe(1);
      expect(result.errors[0]).toMatch(/^Row 1: Room double booked$/);
    });
  });

  describe('assessment types', () => {
    it('lists them', async () => {
      prisma.assessmentType.findMany.mockResolvedValue([]);
      await expect(service.findAllAssessmentTypes()).resolves.toEqual([]);
    });

    it('creates one', async () => {
      prisma.assessmentType.create.mockResolvedValue({ id: 'a-1' });
      await service.createAssessmentType({
        name: 'CAT 1',
        weight: 20,
      } as never);
      expect(prisma.assessmentType.create).toHaveBeenCalled();
    });

    it('removes one', async () => {
      prisma.assessmentType.delete.mockResolvedValue({});
      await expect(service.deleteAssessmentType('a-1')).resolves.toBeDefined();
    });
  });

  describe('reading the structure back', () => {
    it('reads classes in school order, then by name', async () => {
      prisma.classSection.findMany.mockResolvedValue([]);
      await service.findAllSections();
      expect(prisma.classSection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
        }),
      );
    });

    it('narrows the classes to one level when asked', async () => {
      prisma.classSection.findMany.mockResolvedValue([]);
      await service.findAllSections('level-1');
      expect(prisma.classSection.findMany.mock.calls[0][0].where).toEqual({
        classLevelId: 'level-1',
      });
    });

    it('narrows the subjects by scope, trade and level', async () => {
      prisma.subject.findMany.mockResolvedValue([]);
      await service.findAllSubjects({
        scope: 'A_SPECIFIC' as never,
        tradeId: 'trade-1',
        classLevelId: 'level-4',
      });
      const where = prisma.subject.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        scope: 'A_SPECIFIC',
        tradeId: 'trade-1',
      });
    });

    it('narrows the assignments three ways', async () => {
      prisma.teacherSubjectClass.findMany.mockResolvedValue([]);
      await service.findAllAssignments({
        teacherId: 'teacher-1',
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      });
      expect(
        prisma.teacherSubjectClass.findMany.mock.calls[0][0].where,
      ).toMatchObject({
        teacherId: 'teacher-1',
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      });
    });

    it('reads a class timetable, optionally for one teacher', async () => {
      prisma.timetable.findMany.mockResolvedValue([]);
      await service.findTimetable('section-1', 'teacher-1');
      expect(prisma.timetable.findMany.mock.calls[0][0].where).toMatchObject({
        classSectionId: 'section-1',
        teacherId: 'teacher-1',
      });
    });

    it('reads a teacher’s own week', async () => {
      prisma.timetable.findMany.mockResolvedValue([]);
      await service.findTeacherTimetable('teacher-1');
      expect(prisma.timetable.findMany.mock.calls[0][0].where).toMatchObject({
        teacherId: 'teacher-1',
      });
    });
  });
});
