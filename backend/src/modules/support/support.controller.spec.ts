import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import {
  admin,
  clearMocks,
  controllerHarness,
  mockService,
  teacher,
  type RouteCase,
} from '../../test/controller';

/** Support plans (B7): who is asking goes through, so the service can decide. */
describe('SupportController', () => {
  const service = mockService([
    'forStudent',
    'save',
    'remove',
    'forClass',
    'examSheet',
    'register',
  ]);
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(SupportController, [
      { token: SupportService, name: 'service', mock: service },
    ]);
  });

  const plan = { needs: [], arrangements: [] };
  const cases: RouteCase[] = [
    {
      name: 'a plan read, for whoever asks',
      call: (c) => c.read('s1', teacher),
      calls: 'forStudent',
      withArgs: ['s1', teacher],
    },
    {
      name: 'a plan saved, by whom',
      call: (c) => c.save('s1', plan, admin),
      calls: 'save',
      withArgs: ['s1', plan, admin.id],
    },
    {
      name: 'a plan removed',
      call: (c) => c.remove('s1'),
      calls: 'remove',
      withArgs: ['s1'],
    },
    {
      name: "a class's arrangements",
      call: (c) => c.forClass('c1', teacher),
      calls: 'forClass',
      withArgs: ['c1', teacher],
    },
    {
      name: 'an exam sheet',
      call: (c) => c.examSheet('e1', admin),
      calls: 'examSheet',
      withArgs: ['e1', admin],
    },
    {
      name: 'the register',
      call: (c) => c.register(),
      calls: 'register',
      withArgs: [],
    },
  ];
  it.each(cases.map((c) => [c.name, c]))('passes on %s', async (_n, c) =>
    run(c),
  );
});
