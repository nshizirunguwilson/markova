import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/**
 * The platform's own desk: the list of schools and taking a new one on.
 * The guard is tested on its own (platform-owner.guard.spec.ts); here we
 * prove the routes hand the service exactly what came in.
 */
describe('SchoolsController', () => {
  const service = mockService(['findAll', 'create']);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(SchoolsController, [
      { token: SchoolsService, name: 'service', mock: service },
    ]);
  });

  const dto = {
    name: 'G.S. Kigali',
    slug: 'gs-kigali',
    admin: {
      firstName: 'Chantal',
      lastName: 'Mukamana',
      phone: '+250788123456',
    },
  };

  const cases: RouteCase[] = [
    {
      name: 'every school on the platform',
      call: (c) => c.findAll(),
      calls: 'findAll',
      withArgs: [],
    },
    {
      name: 'a school taken on with its first principal',
      call: (c) => c.create(dto),
      calls: 'create',
      withArgs: [dto],
    },
  ];

  for (const c of cases) {
    it(c.name, () => run(c));
  }
});
