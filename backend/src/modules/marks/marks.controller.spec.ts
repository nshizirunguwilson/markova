import { MarksController } from './marks.controller';
import { MarksService } from './marks.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  parent,
  teacher,
  type RouteCase,
} from '../../test/controller';

/**
 * Marks routes.
 *
 * Two things run through every route here. A teacher acts as their Teacher id
 * rather than their User id, and every route naming a student checks whose
 * student it is before answering. A mark is the most consequential number a
 * school publishes about a child, and both of those are one argument each.
 */
describe('MarksController', () => {
  const service = mockService([
    'create',
    'batchEntry',
    'findAll',
    'getCompletionTracker',
    'findById',
    'update',
    'delete',
    'calculateTermResults',
    'getTermResults',
    'getStudentTermResult',
    'updateTermResultComment',
    'publishTermResults',
    'calculateYearResults',
    'getYearResults',
    'getStudentYearResult',
    'getReportCardData',
  ]);
  const ownership = mockService(['verifyStudentAccess']);

  const withTeacherId = { ...teacher, teacherId: 'teacher-1' };

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, ownership);
    run = await controllerHarness(MarksController, [
      { token: MarksService, name: 'service', mock: service },
      { token: OwnershipService, name: 'ownership', mock: ownership },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'one mark entered, as the teacher record',
      call: (c) =>
        c.create({ studentId: 'student-1', score: 17 }, withTeacherId),
      calls: 'create',
      withArgs: [{ studentId: 'student-1', score: 17 }, 'teacher-1', 'TEACHER'],
    },
    {
      name: 'a whole class entered at once',
      call: (c) => c.batchEntry({ marks: [] }, withTeacherId),
      calls: 'batchEntry',
      withArgs: [{ marks: [] }, 'teacher-1', 'TEACHER'],
    },
    {
      name: 'the list, filtered',
      call: (c) => c.findAll({ termId: 'term-1' }),
      calls: 'findAll',
      withArgs: [{ termId: 'term-1' }],
    },
    {
      name: 'how much of a class is still unmarked',
      call: (c) =>
        c.getCompletion('section-1', 'term-1', 'subject-1', 'assess-1'),
      calls: 'getCompletionTracker',
      withArgs: ['section-1', 'term-1', 'subject-1', 'assess-1'],
    },
    {
      name: 'one mark',
      call: (c) => c.findById('mark-1'),
      calls: 'findById',
      withArgs: ['mark-1'],
    },
    {
      name: 'a mark corrected by the teacher who entered it',
      call: (c) => c.update('mark-1', { score: 18 }, withTeacherId),
      calls: 'update',
      withArgs: ['mark-1', { score: 18 }, 'teacher-1', 'TEACHER'],
    },
    {
      name: 'a mark removed by the teacher who entered it',
      call: (c) => c.delete('mark-1', withTeacherId),
      calls: 'delete',
      withArgs: ['mark-1', 'teacher-1', 'TEACHER'],
    },
    {
      name: 'a term worked out',
      call: (c) => c.calculateTermResults({ termId: 'term-1' }),
      calls: 'calculateTermResults',
      withArgs: [{ termId: 'term-1' }],
    },
    {
      name: 'a class’s term results',
      call: (c) => c.getTermResults('section-1', 'term-1'),
      calls: 'getTermResults',
      withArgs: ['section-1', 'term-1'],
    },
    {
      name: 'one student’s term result',
      call: (c) => c.getStudentTermResult('student-1', 'term-1', parent),
      calls: 'getStudentTermResult',
      withArgs: ['student-1', 'term-1'],
    },
    {
      name: 'a class teacher’s comment',
      call: (c) => c.updateComment('res-1', { comment: 'Good term' }),
      calls: 'updateTermResultComment',
      withArgs: ['res-1', { comment: 'Good term' }],
    },
    {
      name: 'a term published',
      call: (c) => c.publishTermResults({ termId: 'term-1' }),
      calls: 'publishTermResults',
      withArgs: [{ termId: 'term-1' }],
    },
    {
      name: 'a year worked out',
      call: (c) => c.calculateYearResults({ academicYearId: 'year-1' }),
      calls: 'calculateYearResults',
      withArgs: [{ academicYearId: 'year-1' }],
    },
    {
      name: 'a class’s year results',
      call: (c) => c.getYearResults('section-1', 'year-1'),
      calls: 'getYearResults',
      withArgs: ['section-1', 'year-1'],
    },
    {
      name: 'one student’s year result',
      call: (c) => c.getStudentYearResult('student-1', 'year-1', parent),
      calls: 'getStudentYearResult',
      withArgs: ['student-1', 'year-1'],
    },
    {
      name: 'the report card',
      call: (c) => c.getReportCard('student-1', 'term-1', parent),
      calls: 'getReportCardData',
      withArgs: ['student-1', 'term-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * A parent passes the role check for their own child and must fail it for
   * anybody else's, which only the ownership service can decide.
   */
  describe('every route naming a student checks whose it is', () => {
    it.each([
      [
        'the term result',
        (c: any) => c.getStudentTermResult('student-1', 't', parent),
      ],
      [
        'the year result',
        (c: any) => c.getStudentYearResult('student-1', 'y', parent),
      ],
      [
        'the report card',
        (c: any) => c.getReportCard('student-1', 't', parent),
      ],
    ])('%s', async (_n, call) => {
      await run({
        name: 'checked',
        call,
        on: 'ownership',
        calls: 'verifyStudentAccess',
        withArgs: [parent.id, 'PARENT', 'student-1'],
      });
    });

    it('refuses before reading a mark', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(
        new Error('Forbidden'),
      );
      const run2 = await controllerHarness(MarksController, [
        { token: MarksService, name: 'service', mock: service },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) => c.getReportCard('student-1', 'term-1', parent),
          calls: 'getReportCardData',
        }),
      ).rejects.toThrow();
      expect(service.getReportCardData).not.toHaveBeenCalled();
    });
  });
});
