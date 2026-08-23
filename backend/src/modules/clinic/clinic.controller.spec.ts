import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';
import {
  admin,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/**
 * Clinic routes.
 *
 * The health record is the narrowest thing in the system, and the narrowing
 * happens here: three routes call `assertMaySee` before reading, and the whole
 * protection is that they do it first.
 */
describe('ClinicController', () => {
  const service = mockService([
    'summary',
    'findVisits',
    'findVisit',
    'createVisit',
    'updateVisit',
    'discharge',
    'markParentNotified',
    'giveMedicine',
    'medicationFor',
    'emergencyCard',
    'saveHealthRecord',
    'assertMaySee',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    run = await controllerHarness(ClinicController, [
      { token: ClinicService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'the month at a glance',
      call: (c) => c.summary(),
      calls: 'summary',
      withArgs: [30],
    },
    {
      name: 'a different window when one is asked for',
      call: (c) => c.summary('7'),
      calls: 'summary',
      withArgs: [7],
    },
    {
      name: 'the clinic book',
      call: (c) => c.findVisits({ inSickBay: 'true' }),
      calls: 'findVisits',
      withArgs: [{ inSickBay: 'true' }],
    },
    {
      name: 'one visit',
      call: (c) => c.findVisit('visit-1'),
      calls: 'findVisit',
      withArgs: ['visit-1'],
    },
    {
      name: 'a visit recorded, attributed to whoever saw them',
      call: (c) => c.createVisit({ studentId: 'student-1', complaint: 'Fever' }, admin),
      calls: 'createVisit',
      withArgs: [{ studentId: 'student-1', complaint: 'Fever' }, admin.id],
    },
    {
      name: 'a visit corrected',
      call: (c) => c.updateVisit('visit-1', { temperature: 38.2 }),
      calls: 'updateVisit',
      withArgs: ['visit-1', { temperature: 38.2 }],
    },
    {
      name: 'a student sent back from the sick bay',
      call: (c) => c.discharge('visit-1'),
      calls: 'discharge',
      withArgs: ['visit-1'],
    },
    {
      name: 'the family recorded as told',
      call: (c) => c.notified('visit-1'),
      calls: 'markParentNotified',
      withArgs: ['visit-1'],
    },
    {
      name: 'a dose recorded, attributed to whoever gave it',
      call: (c) =>
        c.giveMedicine(
          { studentId: 'student-1', medicine: 'Paracetamol', dose: '500mg' },
          admin,
        ),
      calls: 'giveMedicine',
      withArgs: [
        { studentId: 'student-1', medicine: 'Paracetamol', dose: '500mg' },
        admin.id,
      ],
    },
    {
      name: 'every dose given to one student',
      call: (c) => c.medicationFor('student-1', admin),
      calls: 'medicationFor',
      withArgs: ['student-1'],
    },
    {
      name: 'one student’s visits, paged',
      call: (c) => c.visitsFor('student-1', admin, '2', '10'),
      calls: 'findVisits',
      withArgs: [{ studentId: 'student-1', page: 2, limit: 10 }],
    },
    {
      name: 'the emergency card',
      call: (c) => c.emergencyCard('student-1', admin),
      calls: 'emergencyCard',
      withArgs: ['student-1'],
    },
    {
      name: 'the card filled in, attributed to whoever changed it',
      call: (c) =>
        c.saveRecord('student-1', { chronicConditions: 'Asthma' }, admin),
      calls: 'saveHealthRecord',
      withArgs: ['student-1', { chronicConditions: 'Asthma' }, admin.id],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * A role guard cannot decide whose child this is, so the service is asked,
   * on every route a parent can reach.
   */
  describe('a parent is checked against their own child', () => {
    it.each([
      ['the card', (c: any) => c.emergencyCard('student-1', parent)],
      ['the visits', (c: any) => c.visitsFor('student-1', parent)],
      ['the doses', (c: any) => c.medicationFor('student-1', parent)],
    ])('%s', async (_n, call) => {
      await run({
        name: 'checked',
        call,
        calls: 'assertMaySee',
        withArgs: ['student-1', { userId: parent.id, role: 'PARENT' }],
      });
    });

    it('refuses before reading anything', async () => {
      service.assertMaySee.mockRejectedValueOnce(new Error('Forbidden'));
      const run2 = await controllerHarness(ClinicController, [
        { token: ClinicService, name: 'service', mock: service },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) => c.emergencyCard('student-1', parent),
          calls: 'emergencyCard',
        }),
      ).rejects.toThrow();
      expect(service.emergencyCard).not.toHaveBeenCalled();
    });
  });
});
