import { AdmissionsController } from './admissions.controller';
import { PublicAdmissionsController } from './public-admissions.controller';
import { AdmissionsService } from './admissions.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import {
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/**
 * The admissions routes.
 *
 * Two things are worth asserting here. The delegation, because a copied route
 * pointing at the wrong service method would reject the wrong family. And who
 * may reach them at all: an application holds a child's medical conditions and
 * their parents' identity documents before the school has any relationship
 * with the family, so the office is the only audience.
 */
describe('AdmissionsController', () => {
  const service = mockService([
    'intakes',
    'saveIntake',
    'queue',
    'one',
    'decide',
    'requestInfo',
    'makeOffer',
    'revokeOffer',
    'expireOffers',
    'enrol',
    'verifyDocument',
    'addNote',
  ]);

  let run: (c: RouteCase) => Promise<void>;
  const admin = { id: 'admin-1', role: 'ADMIN' };

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(AdmissionsController, [
      { token: AdmissionsService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'every round, with its places',
      call: (c) => c.intakes(),
      calls: 'intakes',
      withArgs: [],
    },
    {
      name: 'a round opened or changed',
      call: (c) => c.saveIntake({ name: 'Senior 1 2026' }),
      calls: 'saveIntake',
      withArgs: [{ name: 'Senior 1 2026' }],
    },
    {
      name: 'the queue',
      call: (c) => c.queue({ bucket: 'TO_DECIDE' }),
      calls: 'queue',
      withArgs: [{ bucket: 'TO_DECIDE' }],
    },
    {
      name: 'one application in full',
      call: (c) => c.one('app-1'),
      calls: 'one',
      withArgs: ['app-1'],
    },
    {
      name: 'an application moved along',
      call: (c) => c.decide('app-1', { status: 'REJECTED' }, admin),
      calls: 'decide',
      withArgs: ['app-1', { status: 'REJECTED' }, 'admin-1'],
    },
    {
      name: 'the family asked for what is missing',
      call: (c) => c.requestInfo('app-1', { documents: [] }, admin),
      calls: 'requestInfo',
      withArgs: ['app-1', { documents: [] }, 'admin-1'],
    },
    {
      name: 'a place held',
      call: (c) => c.offer('app-1', { classSectionId: 'sec-1' }, admin),
      calls: 'makeOffer',
      withArgs: ['app-1', { classSectionId: 'sec-1' }, 'admin-1'],
    },
    {
      name: 'a held place taken back',
      call: (c) => c.revokeOffer({ offerId: 'offer-1', reason: 'gone' }, admin),
      calls: 'revokeOffer',
      withArgs: ['offer-1', 'gone', 'admin-1'],
    },
    {
      name: 'offers nobody answered released',
      call: (c) => c.expireOffers(),
      calls: 'expireOffers',
      withArgs: [],
    },
    {
      name: 'an accepted family enrolled',
      call: (c) => c.enrol('app-1', admin),
      calls: 'enrol',
      withArgs: ['app-1', 'admin-1'],
    },
    {
      name: 'a document checked',
      call: (c) => c.verifyDocument('doc-1', admin),
      calls: 'verifyDocument',
      withArgs: ['doc-1', 'admin-1'],
    },
    {
      name: 'an internal note',
      call: (c) => c.addNote('app-1', { body: 'Spoke to the mother' }, admin),
      calls: 'addNote',
      withArgs: ['app-1', 'Spoke to the mother', 'admin-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * An application holds a child's medical conditions, their address and their
   * parents' identity documents before the school has any relationship with
   * the family at all. Nobody on the roll has business in it.
   */
  describe('who may reach the desk', () => {
    const methods = [
      'intakes',
      'saveIntake',
      'queue',
      'one',
      'decide',
      'requestInfo',
      'offer',
      'revokeOffer',
      'expireOffers',
      'enrol',
      'verifyDocument',
      'addNote',
    ];

    it.each(methods)('%s is the office only', (method) => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        (AdmissionsController.prototype as never)[method],
      );
      expect(roles).toEqual(['ADMIN']);
    });
  });
});

/**
 * What the admissions site and a family can reach without an account.
 *
 * The second set of unguarded routes in the system, so what matters is that
 * they are throttled and that none of them is reachable with a role check
 * somebody could later assume is there.
 */
describe('PublicAdmissionsController', () => {
  const service = mockService([
    'openIntakes',
    'submit',
    'publicStatus',
    'respondToOffer',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(PublicAdmissionsController, [
      { token: AdmissionsService, name: 'service', mock: service },
    ]);
  });

  it.each([
    {
      name: 'the rounds open right now',
      call: (c: any) => c.intakes(),
      calls: 'openIntakes',
      withArgs: [],
    },
    {
      name: 'an application submitted',
      call: (c: any) => c.submit({ firstName: 'Aline' }),
      calls: 'submit',
      withArgs: [{ firstName: 'Aline' }],
    },
    {
      name: 'where an application stands',
      call: (c: any) =>
        c.status({ reference: 'APP-2026-0417', dateOfBirth: '2013-04-02' }),
      calls: 'publicStatus',
      withArgs: ['APP-2026-0417', '2013-04-02'],
    },
    {
      name: 'a family answering an offer',
      call: (c: any) =>
        c.answer({
          reference: 'APP-2026-0417',
          dateOfBirth: '2013-04-02',
          accept: true,
          reason: undefined,
        }),
      calls: 'respondToOffer',
      withArgs: ['APP-2026-0417', '2013-04-02', true, undefined],
    },
  ] as RouteCase[])('$name', async (c) => {
    await run(c);
  });

  /**
   * A form anybody on the internet can post to is a form anybody on the
   * internet can post to four thousand times. The app-wide limit is 100 a
   * minute; these have to be tighter than that or they add nothing.
   */
  describe('throttling', () => {
    /*
      `@Throttle({ default: ... })` stores the limit and the window under keys
      with the throttler's name appended, one key each, rather than as an
      object under a single key.
    */
    const limitOf = (method: string) => {
      const target = (PublicAdmissionsController.prototype as never)[method];
      return {
        limit: Reflect.getMetadata('THROTTLER:LIMITdefault', target),
        ttl: Reflect.getMetadata('THROTTLER:TTLdefault', target),
      };
    };

    it.each(['intakes', 'submit', 'status', 'answer'])(
      '%s carries a limit of its own',
      (method) => {
        expect(limitOf(method).limit).toEqual(expect.any(Number));
      },
    );

    it('holds submissions to a handful a minute', () => {
      expect(limitOf('submit').limit).toBeLessThanOrEqual(10);
      expect(limitOf('submit').ttl).toBe(60000);
    });

    it('is tighter everywhere than the app-wide hundred a minute', () => {
      for (const method of ['intakes', 'submit', 'status', 'answer']) {
        expect(limitOf(method).limit).toBeLessThan(100);
      }
    });
  });

  /*
    No `@Roles` anywhere here. If one appeared, the guard would run and the
    public site would start getting 403s that nobody could explain.
  */
  it('asks for no role at all', () => {
    for (const method of ['intakes', 'submit', 'status', 'answer']) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          (PublicAdmissionsController.prototype as never)[method],
        ),
      ).toBeUndefined();
    }
  });
});
