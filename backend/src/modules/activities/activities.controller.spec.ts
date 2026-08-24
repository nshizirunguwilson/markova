import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import {
  clearMocks,
  admin,
  controllerHarness,
  mockService,
  parent,
  student,
  type RouteCase,
} from '../../test/controller';

/**
 * Activity routes.
 *
 * The one that carries a safeguarding decision is `forStudent`: it returns
 * that student's own consent state, so it has to hand the service the viewer
 * as well as the student. Dropping the viewer would open every family's
 * answers to every signed-in account, which it briefly did.
 */
describe('ActivitiesController', () => {
  const service = mockService([
    'findAll',
    'upcoming',
    'forStudent',
    'findById',
    'consentSummary',
    'create',
    'update',
    'cancel',
    'remove',
    'addParticipant',
    'addClass',
    'removeParticipant',
    'recordConsent',
    'markAttendance',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(ActivitiesController, [
      { token: ActivitiesService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'the calendar',
      call: (c) => c.findAll({ kind: 'TRIP' }),
      calls: 'findAll',
      withArgs: [{ kind: 'TRIP' }],
    },
    {
      name: 'the next few, for a dashboard',
      call: (c) => c.upcoming(),
      calls: 'upcoming',
      withArgs: [5],
    },
    {
      name: 'a longer look ahead when one is asked for',
      call: (c) => c.upcoming('20'),
      calls: 'upcoming',
      withArgs: [20],
    },
    {
      // The viewer travels with the request. Without it the reply would carry
      // one family's consent answers to anyone signed in.
      name: 'one student’s activities, with the viewer attached',
      call: (c) => c.forStudent('student-1', parent, '2026-09-01'),
      calls: 'forStudent',
      withArgs: [
        'student-1',
        '2026-09-01',
        { userId: parent.id, role: 'PARENT' },
      ],
    },
    {
      name: 'a student asking about themselves carries their own identity',
      call: (c) => c.forStudent('student-1', student),
      calls: 'forStudent',
      withArgs: [
        'student-1',
        undefined,
        { userId: student.id, role: 'STUDENT' },
      ],
    },
    {
      name: 'one activity with its list',
      call: (c) => c.findById('act-1'),
      calls: 'findById',
      withArgs: ['act-1'],
    },
    {
      name: 'who has answered and who has not',
      call: (c) => c.consentSummary('act-1'),
      calls: 'consentSummary',
      withArgs: ['act-1'],
    },
    {
      name: 'something put on the calendar',
      call: (c) => c.create({ title: 'Trip' }, admin),
      calls: 'create',
      withArgs: [{ title: 'Trip' }, admin.id],
    },
    {
      name: 'an activity changed',
      call: (c) => c.update('act-1', { title: 'Trip v2' }),
      calls: 'update',
      withArgs: ['act-1', { title: 'Trip v2' }],
    },
    {
      name: 'called off, with the reason carried through',
      call: (c) => c.cancel('act-1', { reason: 'The bus broke down' }),
      calls: 'cancel',
      withArgs: ['act-1', 'The bus broke down'],
    },
    {
      name: 'deleted, when nobody signed up',
      call: (c) => c.remove('act-1'),
      calls: 'remove',
      withArgs: ['act-1'],
    },
    {
      name: 'a student put on the list',
      call: (c) => c.addParticipant('act-1', { studentId: 'student-1' }),
      calls: 'addParticipant',
      withArgs: ['act-1', 'student-1'],
    },
    {
      name: 'a whole class signed up',
      call: (c) => c.addClass('act-1', { classSectionId: 'section-1' }),
      calls: 'addClass',
      withArgs: ['act-1', 'section-1'],
    },
    {
      name: 'a student taken off the list',
      call: (c) => c.removeParticipant('act-1', 'student-1'),
      calls: 'removeParticipant',
      withArgs: ['act-1', 'student-1'],
    },
    {
      // The role travels too, because a parent may answer only for their own
      // child and only the service knows whose child this is.
      name: 'a permission answer, with who gave it and as what',
      call: (c) =>
        c.consent(
          'act-1',
          { studentId: 'student-1', consent: 'GIVEN', note: 'Travel sick' },
          parent,
        ),
      calls: 'recordConsent',
      withArgs: [
        'act-1',
        'student-1',
        'GIVEN',
        'Travel sick',
        parent.id,
        'PARENT',
      ],
    },
    {
      name: 'the register',
      call: (c) =>
        c.attendance('act-1', {
          records: [{ studentId: 'student-1', attended: true }],
        }),
      calls: 'markAttendance',
      withArgs: ['act-1', [{ studentId: 'student-1', attended: true }]],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });
});
