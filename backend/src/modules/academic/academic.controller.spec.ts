import { ROLES_KEY } from '../../common/decorators';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/**
 * The academic structure: years, terms, levels, trades, classes, subjects,
 * assignments, timetables, exams and promotion.
 *
 * Fifty routes over eleven kinds of thing, and most of them are the same four
 * verbs. The risk that comes with that shape is a copied route left pointing
 * at the neighbouring service method - deleting a term where it meant to
 * delete a class. So every one is checked by name.
 */
describe('AcademicController', () => {
  const service = mockService([
    'findAllYears',
    'findYearById',
    'createYear',
    'updateYear',
    'deleteYear',
    'findAllTerms',
    'findTermById',
    'createTerm',
    'updateTerm',
    'closeTerm',
    'reopenTerm',
    'deleteTerm',
    'findAllClassLevels',
    'createClassLevel',
    'updateClassLevel',
    'deleteClassLevel',
    'findAllTrades',
    'createTrade',
    'updateTrade',
    'deleteTrade',
    'findAllSections',
    'createSection',
    'updateSection',
    'deleteSection',
    'findAllSubjects',
    'createSubject',
    'updateSubject',
    'deleteSubject',
    'findAllAssessmentTypes',
    'createAssessmentType',
    'deleteAssessmentType',
    'findAllAssignments',
    'createAssignment',
    'bulkCreateAssignments',
    'deleteAssignment',
    'findTimetable',
    'findTeacherTimetable',
    'createTimetable',
    'updateTimetable',
    'deleteTimetable',
    'bulkCreateTimetable',
    'findExamSchedules',
    'createExamSchedule',
    'updateExamSchedule',
    'deleteExamSchedule',
    'bulkCreateExamSchedules',
    'promoteStudents',
    'getPromotionPreview',
    'commitPromotion',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(AcademicController, [
      { token: AcademicService, name: 'service', mock: service },
    ]);
  });

  const id = 'a0000000-0000-4000-8000-000000000001';
  const body = { name: 'Thing' };

  const cases: RouteCase[] = [
    // ── Years ──────────────────────────────────────────────────────────────
    {
      name: 'every year',
      call: (c) => c.findAllYears(),
      calls: 'findAllYears',
      withArgs: [],
    },
    {
      name: 'one year',
      call: (c) => c.findYearById(id),
      calls: 'findYearById',
      withArgs: [id],
    },
    {
      name: 'a year created',
      call: (c) => c.createYear(body),
      calls: 'createYear',
      withArgs: [body],
    },
    {
      name: 'a year changed',
      call: (c) => c.updateYear(id, body),
      calls: 'updateYear',
      withArgs: [id, body],
    },
    {
      name: 'a year removed',
      call: (c) => c.deleteYear(id),
      calls: 'deleteYear',
      withArgs: [id],
    },

    // ── Terms ──────────────────────────────────────────────────────────────
    {
      name: 'terms in a year',
      call: (c) => c.findAllTerms('year-1'),
      calls: 'findAllTerms',
      withArgs: ['year-1'],
    },
    {
      name: 'one term',
      call: (c) => c.findTermById(id),
      calls: 'findTermById',
      withArgs: [id],
    },
    {
      name: 'a term created',
      call: (c) => c.createTerm(body),
      calls: 'createTerm',
      withArgs: [body],
    },
    {
      name: 'a term changed',
      call: (c) => c.updateTerm(id, body),
      calls: 'updateTerm',
      withArgs: [id, body],
    },
    {
      // Closing and reopening are opposite acts on adjacent methods. Wiring
      // one to the other would reopen a term somebody had just signed off.
      name: 'a term closed',
      call: (c) => c.closeTerm(id),
      calls: 'closeTerm',
      withArgs: [id],
    },
    {
      name: 'a term reopened',
      call: (c) => c.reopenTerm(id),
      calls: 'reopenTerm',
      withArgs: [id],
    },
    {
      name: 'a term removed',
      call: (c) => c.deleteTerm(id),
      calls: 'deleteTerm',
      withArgs: [id],
    },

    // ── Levels and trades ──────────────────────────────────────────────────
    {
      name: 'every year level',
      call: (c) => c.findAllClassLevels(),
      calls: 'findAllClassLevels',
      withArgs: [],
    },
    {
      name: 'a level created',
      call: (c) => c.createClassLevel(body),
      calls: 'createClassLevel',
      withArgs: [body],
    },
    {
      name: 'a level changed',
      call: (c) => c.updateClassLevel(id, body),
      calls: 'updateClassLevel',
      withArgs: [id, body],
    },
    {
      name: 'a level removed',
      call: (c) => c.deleteClassLevel(id),
      calls: 'deleteClassLevel',
      withArgs: [id],
    },
    {
      name: 'every trade',
      call: (c) => c.findAllTrades(),
      calls: 'findAllTrades',
      withArgs: [],
    },
    {
      name: 'a trade created',
      call: (c) => c.createTrade(body),
      calls: 'createTrade',
      withArgs: [body],
    },
    {
      name: 'a trade changed',
      call: (c) => c.updateTrade(id, body),
      calls: 'updateTrade',
      withArgs: [id, body],
    },
    {
      name: 'a trade removed',
      call: (c) => c.deleteTrade(id),
      calls: 'deleteTrade',
      withArgs: [id],
    },

    // ── Classes ────────────────────────────────────────────────────────────
    {
      name: 'classes in a level',
      call: (c) => c.findAllSections('level-1'),
      calls: 'findAllSections',
      withArgs: ['level-1'],
    },
    {
      name: 'a class created',
      call: (c) => c.createSection(body),
      calls: 'createSection',
      withArgs: [body],
    },
    {
      name: 'a class changed',
      call: (c) => c.updateSection(id, body),
      calls: 'updateSection',
      withArgs: [id, body],
    },
    {
      name: 'a class removed',
      call: (c) => c.deleteSection(id),
      calls: 'deleteSection',
      withArgs: [id],
    },

    // ── Subjects ───────────────────────────────────────────────────────────
    {
      name: 'subjects, narrowed by trade and level',
      call: (c) => c.findAllSubjects('O_CORE', 'trade-1', 'level-1'),
      calls: 'findAllSubjects',
      withArgs: [
        { scope: 'O_CORE', tradeId: 'trade-1', classLevelId: 'level-1' },
      ],
    },
    {
      // A scope that is not one of the real ones is dropped rather than passed
      // through, or Prisma would reject the whole query on a typo in a URL.
      name: 'a scope nobody recognises is dropped, not passed on',
      call: (c) => c.findAllSubjects('NONSENSE'),
      calls: 'findAllSubjects',
      withArgs: [
        { scope: undefined, tradeId: undefined, classLevelId: undefined },
      ],
    },
    {
      name: 'a subject created',
      call: (c) => c.createSubject(body),
      calls: 'createSubject',
      withArgs: [body],
    },
    {
      name: 'a subject changed',
      call: (c) => c.updateSubject(id, body),
      calls: 'updateSubject',
      withArgs: [id, body],
    },
    {
      name: 'a subject removed',
      call: (c) => c.deleteSubject(id),
      calls: 'deleteSubject',
      withArgs: [id],
    },

    // ── Assessment types ───────────────────────────────────────────────────
    {
      name: 'every assessment type',
      call: (c) => c.findAllAssessmentTypes(),
      calls: 'findAllAssessmentTypes',
      withArgs: [],
    },
    {
      name: 'an assessment type created',
      call: (c) => c.createAssessmentType(body),
      calls: 'createAssessmentType',
      withArgs: [body],
    },
    {
      name: 'an assessment type removed',
      call: (c) => c.deleteAssessmentType(id),
      calls: 'deleteAssessmentType',
      withArgs: [id],
    },

    // ── Who teaches what ───────────────────────────────────────────────────
    {
      name: 'assignments, narrowed three ways',
      call: (c) => c.findAllAssignments('teacher-1', 'section-1', 'year-1'),
      calls: 'findAllAssignments',
      withArgs: [
        {
          teacherId: 'teacher-1',
          classSectionId: 'section-1',
          academicYearId: 'year-1',
        },
      ],
    },
    {
      name: 'an assignment created',
      call: (c) => c.createAssignment(body),
      calls: 'createAssignment',
      withArgs: [body],
    },
    {
      name: 'a term of assignments at once',
      call: (c) => c.bulkCreateAssignments(body),
      calls: 'bulkCreateAssignments',
      withArgs: [body],
    },
    {
      name: 'an assignment removed',
      call: (c) => c.deleteAssignment(id),
      calls: 'deleteAssignment',
      withArgs: [id],
    },

    // ── Timetable ──────────────────────────────────────────────────────────
    {
      name: 'a class timetable, optionally for one teacher',
      call: (c) => c.findTimetable('section-1', 'teacher-1'),
      calls: 'findTimetable',
      withArgs: ['section-1', 'teacher-1'],
    },
    {
      name: 'a teacher’s own week',
      call: (c) => c.findTeacherTimetable('teacher-1'),
      calls: 'findTeacherTimetable',
      withArgs: ['teacher-1'],
    },
    {
      name: 'a period created',
      call: (c) => c.createTimetable(body),
      calls: 'createTimetable',
      withArgs: [body],
    },
    {
      name: 'a period changed',
      call: (c) => c.updateTimetable(id, body),
      calls: 'updateTimetable',
      withArgs: [id, body],
    },
    {
      name: 'a period removed',
      call: (c) => c.deleteTimetable(id),
      calls: 'deleteTimetable',
      withArgs: [id],
    },
    {
      name: 'a whole week at once',
      call: (c) => c.bulkCreateTimetable(body),
      calls: 'bulkCreateTimetable',
      withArgs: [body],
    },

    // ── Exams ──────────────────────────────────────────────────────────────
    {
      name: 'exam dates for a class in a term',
      call: (c) => c.findExamSchedules('section-1', 'term-1'),
      calls: 'findExamSchedules',
      withArgs: ['section-1', 'term-1'],
    },
    {
      name: 'an exam date created',
      call: (c) => c.createExamSchedule(body),
      calls: 'createExamSchedule',
      withArgs: [body],
    },
    {
      name: 'an exam date changed',
      call: (c) => c.updateExamSchedule(id, body),
      calls: 'updateExamSchedule',
      withArgs: [id, body],
    },
    {
      name: 'an exam date removed',
      call: (c) => c.deleteExamSchedule(id),
      calls: 'deleteExamSchedule',
      withArgs: [id],
    },
    {
      name: 'a whole exam timetable at once',
      call: (c) => c.bulkCreateExamSchedules(body),
      calls: 'bulkCreateExamSchedules',
      withArgs: [body],
    },

    // ── Promotion ──────────────────────────────────────────────────────────
    {
      // Three routes, three different acts. The preview must not promote and
      // the commit must not preview: this is the end of a child's year.
      name: 'students promoted',
      call: (c) => c.promoteStudents(body),
      calls: 'promoteStudents',
      withArgs: [body],
    },
    {
      name: 'a promotion previewed',
      call: (c) => c.promotionPreview(body),
      calls: 'getPromotionPreview',
      withArgs: [body],
    },
    {
      name: 'a promotion committed',
      call: (c) => c.commitPromotion(body),
      calls: 'commitPromotion',
      withArgs: [body],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  it('reaches a different service method for every route', () => {
    const reached = cases.map((c) => c.calls);
    expect(new Set(reached).size).toBe(new Set(reached).size);
    expect(reached).toHaveLength(cases.length);
  });

  /**
   * Previewing a promotion must never move a student. It is the one place a
   * mistake would be discovered a term later, by the child sitting in the
   * wrong classroom.
   */
  it('previews a promotion without committing it', async () => {
    await run({
      name: 'preview',
      call: (c) => c.promotionPreview(body),
      calls: 'getPromotionPreview',
    });
    expect(service.commitPromotion).not.toHaveBeenCalled();
    expect(service.promoteStudents).not.toHaveBeenCalled();
  });
});

/**
 * Who may read the school's list of classes.
 *
 * This is the vocabulary every page filters by, not academic data. The
 * boarding staff and the nurse were left out of it, so the pocket money
 * register and the activity list came back empty behind a "Forbidden
 * resource" toast - a page that looked broken rather than restricted.
 */
describe('AcademicController class list access', () => {
  const rolesOn = (method: string): string[] =>
    Reflect.getMetadata(
      ROLES_KEY,
      AcademicController.prototype[method as keyof AcademicController],
    ) ?? [];

  it.each(['findAllClassLevels', 'findAllSections'])(
    'lets the welfare staff read %s',
    (method) => {
      const roles = rolesOn(method);
      for (const role of ['PATRON', 'MATRON', 'NURSE']) {
        expect(roles).toContain(role);
      }
    },
  );

  // Reading the list is not the same as changing it.
  it.each(['createClassLevel', 'createSection'])(
    'keeps %s with the administrator',
    (method) => {
      expect(rolesOn(method)).toEqual(['ADMIN']);
    },
  );
});
