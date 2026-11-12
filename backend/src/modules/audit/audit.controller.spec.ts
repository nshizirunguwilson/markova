import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/** The record of who changed what, for the principal. */
describe('AuditController', () => {
  const service = mockService(['find', 'filters']);
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(AuditController, [
      { token: AuditService, name: 'service', mock: service },
    ]);
  });

  it('passes the filters on as asked', () =>
    run({
      name: 'find',
      call: (c) => c.find({ entityType: 'support-plan', page: 2 }),
      calls: 'find',
      withArgs: [{ entityType: 'support-plan', page: 2 }],
    }));

  it('lists the kinds of record and action present', () =>
    run({
      name: 'filters',
      call: (c) => c.filters(),
      calls: 'filters',
      withArgs: [],
    }));
});
