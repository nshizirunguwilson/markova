import { MarksController } from './marks.controller';
import { MarksService } from './marks.service';
import { OwnershipService } from '../../common/ownership.service';
import { FeeGateService } from '../../common/fee-gate.service';
import { HeadTeacherDashboardService } from './head-teacher-dashboard.service';
import {
  buildController,
  clearMocks,
  controllerHarness,
  mockService,
  parent,
  teacher,
  type Provided,
  type RouteCase,
} from '../../test/controller';

/**
 * What the controller needs to start.
 *
 * One helper because there were four lists of this, in four describes, and
 * adding a dependency to the controller broke three of them one at a time.
 * The controller's dependencies are a fact about the controller, not about
 * whichever block happens to be building it.
 */
type Mocks = Record<string, jest.Mock>;
const wiring = (mocks: {
  service: Mocks;
  ownership: Mocks;
  feeGate: Mocks;
  dashboard?: Mocks;
}): Provided[] => [
  { token: MarksService, name: 'service', mock: mocks.service },
  { token: OwnershipService, name: 'ownership', mock: mocks.ownership },
  { token: FeeGateService, name: 'feeGate', mock: mocks.feeGate },
  {
    token: HeadTeacherDashboardService,
    name: 'dashboard',
    mock: mocks.dashboard ?? { overview: jest.fn() },
  },
];

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
    'classesForComments',
    'publishTermResults',
    'calculateYearResults',
    'getYearResults',
    'getStudentYearResult',
    'getReportCardData',
    'isReportCardIssued',
  ]);
  const ownership = mockService(['verifyStudentAccess']);
  /* The fee gate answers "nothing is being withheld" unless a test says
     otherwise, so these cases stay about what they were written for. */
  const feeGate = {
    withholdingFor: jest.fn().mockResolvedValue(null),
    withholdingForYear: jest.fn().mockResolvedValue(null),
    assertReleased: jest.fn().mockResolvedValue(undefined),
    assertYearReleased: jest.fn().mockResolvedValue(undefined),
  };

  const dashboard = { overview: jest.fn().mockResolvedValue({ classes: [] }) };

  const withTeacherId = { ...teacher, teacherId: 'teacher-1' };

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, ownership, dashboard);
    // Issued by default, so the route cases exercise the normal path; the
    // gate itself is checked in its own describe below.
    service.isReportCardIssued.mockResolvedValue(true);
    service.getReportCardData.mockResolvedValue({ school: {} });
    run = await controllerHarness(
      MarksController,
      wiring({ service, ownership, feeGate, dashboard }),
    );
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
      // The viewer's role travels too: it decides whether unpublished
      // figures come back at all.
      withArgs: ['student-1', 'term-1', 'PARENT'],
    },
    {
      name: 'a class teacher’s comment',
      /* Who is writing travels with it: the service decides whether a
         teacher is the class teacher of the class this card belongs to. */
      call: (c) =>
        c.updateComment(
          'res-1',
          { teacherComment: 'Good term' },
          withTeacherId,
        ),
      calls: 'updateTermResultComment',
      withArgs: [
        'res-1',
        { teacherComment: 'Good term' },
        { role: 'TEACHER', teacherId: 'teacher-1' },
      ],
    },
    {
      name: 'the classes whose cards this person may write on',
      call: (c) => c.commentClasses(withTeacherId),
      calls: 'classesForComments',
      withArgs: [{ role: 'TEACHER', teacherId: 'teacher-1' }],
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
        withArgs: [parent.id, 'PARENT', 'student-1', 'results'],
      });
    });

    it('refuses before reading a mark', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(
        new Error('Forbidden'),
      );
      const run2 = await controllerHarness(
        MarksController,
        wiring({ service, ownership, feeGate, dashboard }),
      );
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

/**
 * What a student is allowed to see before the school has released it.
 *
 * The route always checked that the right family was asking. It never checked
 * whether the school had published anything - so a term appeared on a
 * student's page the moment a teacher typed the marks in, days before the
 * school meant to release them.
 */
describe('results a student may not see yet', () => {
  const service = mockService([
    'getStudentTermResult',
    'getReportCardData',
    'isReportCardIssued',
  ]);
  const ownership = mockService(['verifyStudentAccess']);
  /* The fee gate answers "nothing is being withheld" unless a test says
     otherwise, so these cases stay about what they were written for. */
  const feeGate = {
    withholdingFor: jest.fn().mockResolvedValue(null),
    withholdingForYear: jest.fn().mockResolvedValue(null),
    assertReleased: jest.fn().mockResolvedValue(undefined),
    assertYearReleased: jest.fn().mockResolvedValue(undefined),
  };

  const build = () =>
    buildController(MarksController, wiring({ service, ownership, feeGate }));

  beforeEach(() => {
    clearMocks(service, ownership);
    service.getReportCardData.mockResolvedValue({ school: {} });
  });

  it.each(['STUDENT', 'PARENT'])(
    'passes %s along so the service can withhold unpublished marks',
    async (role) => {
      const ctl: any = await build();
      await ctl.getStudentTermResult('student-1', 'term-1', {
        id: 'u-1',
        role,
      });
      expect(service.getStudentTermResult).toHaveBeenCalledWith(
        'student-1',
        'term-1',
        role,
      );
    },
  );

  // Staff read drafts on purpose: checking the figures before releasing them
  // is the entire point of an unpublished result.
  it.each(['ADMIN', 'TEACHER'])('lets %s read a draft', async (role) => {
    const ctl: any = await build();
    await ctl.getStudentTermResult('student-1', 'term-1', { id: 'u-1', role });
    expect(service.getStudentTermResult).toHaveBeenCalledWith(
      'student-1',
      'term-1',
      role,
    );
  });

  it.each(['STUDENT', 'PARENT'])(
    'withholds the report card from %s until it is issued',
    async (role) => {
      service.isReportCardIssued.mockResolvedValue(false);
      const ctl: any = await build();

      const out = await ctl.getReportCard('student-1', 'term-1', {
        id: 'u-1',
        role,
      });

      expect(out).toEqual({ issued: false });
      expect(service.getReportCardData).not.toHaveBeenCalled();
    },
  );

  it('hands over the card once it has been issued', async () => {
    service.isReportCardIssued.mockResolvedValue(true);
    const ctl: any = await build();

    const out = await ctl.getReportCard('student-1', 'term-1', {
      id: 'u-1',
      role: 'STUDENT',
    });

    expect(out.issued).toBe(true);
    expect(service.getReportCardData).toHaveBeenCalled();
  });

  // Staff never hit the gate: they have to read the card before issuing it.
  it.each(['ADMIN', 'TEACHER'])('never gates the card for %s', async (role) => {
    const ctl: any = await build();
    await ctl.getReportCard('student-1', 'term-1', { id: 'u-1', role });
    expect(service.isReportCardIssued).not.toHaveBeenCalled();
    expect(service.getReportCardData).toHaveBeenCalled();
  });

  // Ownership is still the first question: the gate is about timing, not
  // about whose child it is.
  it('checks whose student it is before anything else', async () => {
    ownership.verifyStudentAccess.mockRejectedValueOnce(new Error('Forbidden'));
    const ctl: any = await build();
    await expect(
      ctl.getReportCard('student-1', 'term-1', { id: 'u-1', role: 'PARENT' }),
    ).rejects.toThrow();
    expect(service.isReportCardIssued).not.toHaveBeenCalled();
  });
});

/**
 * Marks held because the term's fees are owed.
 *
 * These three routes are what a student's own marks page is built from, so
 * they report the hold rather than refusing it. A 403 here is a dead end: the
 * page has nothing to draw and the family is told only that they are blocked.
 * Answering with `withheld` lets the page name the term, the amount, and
 * where to go about it.
 */
describe('marks held over unpaid fees', () => {
  const service = mockService([
    'getStudentTermResult',
    'getStudentYearResult',
    'getReportCardData',
    'isReportCardIssued',
  ]);
  const ownership = mockService(['verifyStudentAccess']);
  const withheld = {
    balance: 75000,
    message: '75,000 RWF is still outstanding',
  };
  const feeGate = {
    withholdingFor: jest.fn(),
    withholdingForYear: jest.fn(),
    assertReleased: jest.fn().mockResolvedValue(undefined),
    assertYearReleased: jest.fn().mockResolvedValue(undefined),
  };

  const build = () =>
    buildController(MarksController, wiring({ service, ownership, feeGate }));

  beforeEach(() => {
    clearMocks(service, ownership);
    feeGate.withholdingFor.mockReset().mockResolvedValue(null);
    feeGate.withholdingForYear.mockReset().mockResolvedValue(null);
    service.isReportCardIssued.mockResolvedValue(true);
  });

  describe("a term's result", () => {
    it('is reported as held, with the amount, rather than refused', async () => {
      feeGate.withholdingFor.mockResolvedValue(withheld);
      const ctl: any = await build();
      const answer = await ctl.getStudentTermResult('student-1', 'term-1', {
        id: 'u-1',
        role: 'STUDENT',
      });
      expect(answer).toEqual({ withheld });
    });

    // Held means held: none of the figures come back alongside the notice.
    it('does not read the result at all while it is held', async () => {
      feeGate.withholdingFor.mockResolvedValue(withheld);
      const ctl: any = await build();
      await ctl.getStudentTermResult('student-1', 'term-1', {
        id: 'u-1',
        role: 'PARENT',
      });
      expect(service.getStudentTermResult).not.toHaveBeenCalled();
    });

    it('comes back as normal once the term is settled', async () => {
      const ctl: any = await build();
      await ctl.getStudentTermResult('student-1', 'term-1', {
        id: 'u-1',
        role: 'STUDENT',
      });
      expect(service.getStudentTermResult).toHaveBeenCalledWith(
        'student-1',
        'term-1',
        'STUDENT',
      );
    });

    it('checks whose student it is before the fees', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(new Error('no'));
      const ctl: any = await build();
      await expect(
        ctl.getStudentTermResult('student-1', 'term-1', {
          id: 'u-1',
          role: 'PARENT',
        }),
      ).rejects.toThrow();
      expect(feeGate.withholdingFor).not.toHaveBeenCalled();
    });
  });

  describe("a year's result", () => {
    it('is reported as held while any of its terms is owed on', async () => {
      feeGate.withholdingForYear.mockResolvedValue(withheld);
      const ctl: any = await build();
      const answer = await ctl.getStudentYearResult('student-1', 'year-1', {
        id: 'u-1',
        role: 'STUDENT',
      });
      expect(answer).toEqual({ withheld });
      expect(service.getStudentYearResult).not.toHaveBeenCalled();
    });

    it('comes back as normal once the year is settled', async () => {
      const ctl: any = await build();
      await ctl.getStudentYearResult('student-1', 'year-1', {
        id: 'u-1',
        role: 'PARENT',
      });
      expect(service.getStudentYearResult).toHaveBeenCalled();
    });
  });

  describe('the report card', () => {
    /*
      Issued and held are two different answers, and the page says something
      different for each: one is the school still working, the other is
      something the family can act on.
    */
    it('is issued but held, not reported as unissued', async () => {
      feeGate.withholdingFor.mockResolvedValue(withheld);
      const ctl: any = await build();
      const answer = await ctl.getReportCard('student-1', 'term-1', {
        id: 'u-1',
        role: 'STUDENT',
      });
      expect(answer).toEqual({ issued: true, withheld });
      expect(service.getReportCardData).not.toHaveBeenCalled();
    });

    it('says unissued when it has not been released, whatever is owed', async () => {
      service.isReportCardIssued.mockResolvedValue(false);
      feeGate.withholdingFor.mockResolvedValue(withheld);
      const ctl: any = await build();
      const answer = await ctl.getReportCard('student-1', 'term-1', {
        id: 'u-1',
        role: 'PARENT',
      });
      expect(answer).toEqual({ issued: false });
    });

    it('hands the card over once the term is settled', async () => {
      const ctl: any = await build();
      const answer = await ctl.getReportCard('student-1', 'term-1', {
        id: 'u-1',
        role: 'STUDENT',
      });
      expect(answer).toMatchObject({ issued: true });
      expect(service.getReportCardData).toHaveBeenCalled();
    });

    // Staff read the card to mark and to issue it; money never stops them.
    it.each(['ADMIN', 'TEACHER'])('is never held for %s', async (role) => {
      feeGate.withholdingFor.mockResolvedValue(null);
      const ctl: any = await build();
      await ctl.getReportCard('student-1', 'term-1', { id: 'u-1', role });
      expect(service.getReportCardData).toHaveBeenCalled();
    });
  });
});

/** The Director of Studies' routes: the morning view, and standing behind cards. */
describe('MarksController, the Director of Studies', () => {
  const service = mockService(['confirmReportCards', 'publishReportCards']);
  const dashboard = { overview: jest.fn().mockResolvedValue({ classes: [] }) };
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, dashboard);
    run = await controllerHarness(
      MarksController,
      wiring({
        service,
        ownership: mockService(['verifyStudentAccess']),
        feeGate: mockService(['assertReleased']),
        dashboard,
      }),
    );
  });

  it('opens the morning view for a term', () =>
    run({
      name: 'overview',
      call: (c) => c.headTeacherOverview('term-1'),
      on: 'dashboard',
      calls: 'overview',
      withArgs: ['term-1'],
    }));

  it('confirms a class’s cards as the person confirming', () =>
    run({
      name: 'confirm',
      call: (c) =>
        c.confirmReportCards({ classSectionId: 'c1' }, { id: 'dos-1' }),
      calls: 'confirmReportCards',
      withArgs: [{ classSectionId: 'c1' }, 'dos-1'],
    }));

  it('issues or withdraws a class’s cards', () =>
    run({
      name: 'publish',
      call: (c) =>
        c.publishReportCards({ classSectionId: 'c1', publish: true }),
      calls: 'publishReportCards',
      withArgs: [{ classSectionId: 'c1', publish: true }],
    }));
});
