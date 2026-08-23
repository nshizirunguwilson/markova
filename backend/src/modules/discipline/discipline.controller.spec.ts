import { DisciplineController } from './discipline.controller';
import { DisciplineService } from './discipline.service';
import { MeritsService } from './merits.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  admin,
  controllerHarness,
  mockService,
  parent,
  teacher,
  type RouteCase,
} from '../../test/controller';

/**
 * Behaviour routes, both sides of them.
 *
 * An incident costs a student points and reaches their family, and an appeal
 * is the family's only answer to it. So the routes a parent can reach are
 * checked against their own child, and the one that reads an incident by id
 * has to look the incident up before it can even know whose child it is.
 */
describe('DisciplineController', () => {
  const service = mockService([
    'createIncident',
    'findIncidents',
    'getIncidentById',
    'updateIncident',
    'deleteIncident',
    'getStudentDiscipline',
    'createAppeal',
    'getPendingAppeals',
    'reviewAppeal',
    'acknowledgeIncident',
    'getDashboard',
  ]);
  const merits = mockService(['watchList', 'summary', 'find', 'award', 'standing']);
  const ownership = mockService(['verifyStudentAccess']);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    service.getIncidentById.mockResolvedValue({
      id: 'inc-1',
      studentId: 'student-1',
    });
    run = await controllerHarness(DisciplineController, [
      { token: DisciplineService, name: 'service', mock: service },
      { token: MeritsService, name: 'merits', mock: merits },
      { token: OwnershipService, name: 'ownership', mock: ownership },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'an incident recorded, attributed to whoever recorded it',
      call: (c) => c.createIncident({ studentId: 'student-1' }, teacher),
      calls: 'createIncident',
      withArgs: [{ studentId: 'student-1' }, teacher.id],
    },
    {
      name: 'the register of incidents',
      call: (c) => c.findIncidents({ termId: 'term-1' }),
      calls: 'findIncidents',
      withArgs: [{ termId: 'term-1' }],
    },
    {
      name: 'one incident, for staff',
      call: (c) => c.getIncident('inc-1', admin),
      calls: 'getIncidentById',
      withArgs: ['inc-1'],
    },
    {
      name: 'an incident corrected',
      call: (c) => c.updateIncident('inc-1', { description: 'Corrected' }),
      calls: 'updateIncident',
      withArgs: ['inc-1', { description: 'Corrected' }],
    },
    {
      name: 'an incident struck out',
      call: (c) => c.deleteIncident('inc-1'),
      calls: 'deleteIncident',
      withArgs: ['inc-1'],
    },
    {
      name: 'one student’s record',
      call: (c) => c.getStudentDiscipline('student-1', parent),
      calls: 'getStudentDiscipline',
      withArgs: ['student-1'],
    },
    {
      // The role travels because a student may appeal for themselves and a
      // parent for their child, and the service decides which.
      name: 'an appeal, with who filed it and as what',
      call: (c) => c.createAppeal({ incidentId: 'inc-1' }, parent),
      calls: 'createAppeal',
      withArgs: [{ incidentId: 'inc-1' }, parent.id, 'PARENT'],
    },
    {
      name: 'the appeals waiting',
      call: (c) => c.getPendingAppeals(),
      calls: 'getPendingAppeals',
      withArgs: [],
    },
    {
      name: 'an appeal decided, attributed to whoever decided it',
      call: (c) => c.reviewAppeal('ap-1', { status: 'APPROVED' }, admin),
      calls: 'reviewAppeal',
      withArgs: ['ap-1', { status: 'APPROVED' }, admin.id],
    },
    {
      name: 'a parent saying they have seen it',
      call: (c) => c.acknowledge({ incidentId: 'inc-1' }, parent),
      calls: 'acknowledgeIncident',
      withArgs: ['inc-1', parent.id],
    },
    {
      name: 'discipline across the school',
      call: (c) => c.getDashboard('term-1'),
      calls: 'getDashboard',
      withArgs: ['term-1'],
    },
    {
      name: 'who to look at this week',
      call: (c) => c.watchList('7'),
      on: 'merits',
      calls: 'watchList',
      withArgs: [7],
    },
    {
      name: 'a month by default',
      call: (c) => c.watchList(),
      on: 'merits',
      calls: 'watchList',
      withArgs: [30],
    },
    {
      name: 'what the school recognises',
      call: (c) => c.meritSummary('term-1', '7'),
      on: 'merits',
      calls: 'summary',
      withArgs: ['term-1', 7],
    },
    {
      name: 'the merits awarded',
      call: (c) => c.findMerits({ termId: 'term-1' }),
      on: 'merits',
      calls: 'find',
      withArgs: [{ termId: 'term-1' }],
    },
    {
      name: 'a student recognised, attributed to whoever recognised them',
      call: (c) => c.awardMerit({ studentId: 'student-1', points: 5 }, teacher),
      on: 'merits',
      calls: 'award',
      withArgs: [{ studentId: 'student-1', points: 5 }, teacher.id],
    },
    {
      name: 'one student’s standing, both sides',
      call: (c) => c.standing('student-1', parent, 'term-1'),
      on: 'merits',
      calls: 'standing',
      withArgs: ['student-1', 'term-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  describe('a parent is held to their own child', () => {
    it.each([
      ['their record', (c: any) => c.getStudentDiscipline('student-1', parent)],
      ['their standing', (c: any) => c.standing('student-1', parent)],
    ])('%s', async (_n, call) => {
      await run({
        name: 'checked',
        call,
        on: 'ownership',
        calls: 'verifyStudentAccess',
        withArgs: [parent.id, 'PARENT', 'student-1'],
      });
    });

    /**
     * An incident is fetched by its own id, so whose child it concerns is not
     * known until it has been read. The check therefore happens after the
     * read and before the reply, using the student the incident names.
     */
    it('checks a parent against the student the incident names', async () => {
      await run({
        name: 'checked',
        call: (c) => c.getIncident('inc-1', parent),
        on: 'ownership',
        calls: 'verifyStudentAccess',
        withArgs: [parent.id, 'PARENT', 'student-1'],
      });
    });

    it('does not check staff against a child they do not have', async () => {
      await run({
        name: 'staff',
        call: (c) => c.getIncident('inc-1', admin),
        calls: 'getIncidentById',
      });
      expect(ownership.verifyStudentAccess).not.toHaveBeenCalled();
    });

    it('refuses a parent the incident rather than returning it', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(new Error('Forbidden'));
      const run2 = await controllerHarness(DisciplineController, [
        { token: DisciplineService, name: 'service', mock: service },
        { token: MeritsService, name: 'merits', mock: merits },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) => c.getIncident('inc-1', parent),
          calls: 'getIncidentById',
        }),
      ).rejects.toThrow();
    });
  });
});
