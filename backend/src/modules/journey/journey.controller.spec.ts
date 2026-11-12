import { PauseKind } from '@prisma/client';
import { JourneyController } from './journey.controller';
import { JourneyService } from './journey.service';
import {
  admin,
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/**
 * A student's journey (B8, A9): every change of standing goes to
 * JourneyService, named for the person who made it.
 */
describe('JourneyController', () => {
  const service = mockService([
    'journey',
    'pause',
    'back',
    'leave',
    'passedAway',
    'readmit',
    'parentPassedAway',
  ]);
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(JourneyController, [
      { token: JourneyService, name: 'service', mock: service },
    ]);
  });

  const dto = { reason: 'A reason' };
  const cases: RouteCase[] = [
    {
      name: 'the journey read',
      call: (c) => c.read('s1'),
      calls: 'journey',
      withArgs: ['s1'],
    },
    {
      name: 'a suspension',
      call: (c) => c.suspend('s1', dto, admin),
      calls: 'pause',
      withArgs: ['s1', PauseKind.SUSPENDED, dto, admin.id],
    },
    {
      name: 'time away',
      call: (c) => c.away('s1', dto, admin),
      calls: 'pause',
      withArgs: ['s1', PauseKind.AWAY, dto, admin.id],
    },
    {
      name: 'back early',
      call: (c) => c.back('s1', dto, admin),
      calls: 'back',
      withArgs: ['s1', dto, admin.id],
    },
    {
      name: 'leaving',
      call: (c) => c.leave('s1', dto, admin),
      calls: 'leave',
      withArgs: ['s1', dto, admin.id],
    },
    {
      name: 'a death recorded',
      call: (c) => c.passedAway('s1', dto, admin),
      calls: 'passedAway',
      withArgs: ['s1', dto, admin.id],
    },
    {
      name: 'coming back',
      call: (c) => c.readmit('s1', dto, admin),
      calls: 'readmit',
      withArgs: ['s1', dto, admin.id],
    },
    {
      name: "a parent's death recorded",
      call: (c) => c.parentPassedAway('u1', dto),
      calls: 'parentPassedAway',
      withArgs: ['u1', dto],
    },
  ];
  it.each(cases.map((c) => [c.name, c]))('passes on %s', async (_n, c) =>
    run(c),
  );
});
