import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  student,
  type RouteCase,
} from '../../test/controller';

/** A student of 18 deciding what their parents see (A8): always their own. */
describe('SharingController', () => {
  const service = mockService(['mine', 'change']);
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(SharingController, [
      { token: SharingService, name: 'service', mock: service },
    ]);
  });

  it('reads the signed-in student’s own switches', () =>
    run({
      name: 'mine',
      call: (c) => c.mine(student),
      calls: 'mine',
      withArgs: [student.id],
    }));

  it('changes the signed-in student’s own switches', () =>
    run({
      name: 'change',
      call: (c) => c.change(student, { health: false }),
      calls: 'change',
      withArgs: [student.id, { health: false }],
    }));
});
