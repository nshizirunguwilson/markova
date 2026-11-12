import { PocketMoneyController } from './pocket-money.controller';
import { PocketMoneyService } from './pocket-money.service';
import {
  clearMocks,
  admin,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/**
 * The counter's routes.
 *
 * The money ones matter most: an argument in the wrong order here would pay
 * out the wrong amount or credit the wrong child, and nothing in the service's
 * own tests would notice.
 */
describe('PocketMoneyController', () => {
  const service = mockService([
    'overview',
    'findByIdentifier',
    'assertMayView',
    'getAccount',
    'getStatement',
    'deposit',
    'withdraw',
    'refund',
    'reverse',
    'updateLimits',
    'assertSide',
    'assertSideOfEntry',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    service.findByIdentifier.mockResolvedValue({ studentId: 'student-1' });
    run = await controllerHarness(PocketMoneyController, [
      { token: PocketMoneyService, name: 'service', mock: service },
    ]);
  });

  const money = {
    studentId: 'student-1',
    amount: 5000,
    note: 'Visiting day',
  };

  const cases: RouteCase[] = [
    {
      name: 'the roll of every account',
      call: (c) => c.overview({ page: 2, limit: 25 }, admin),
      calls: 'overview',
      withArgs: [{ page: 2, limit: 25 }, 'ADMIN'],
    },
    {
      // The field is `identifier`, and sending anything else is a 400 on every
      // scan. That is not hypothetical: the phone did exactly that.
      name: 'a card scan resolves to a student',
      call: (c) => c.lookup({ identifier: 'STD-2025-231419-167' }, admin),
      calls: 'findByIdentifier',
      withArgs: ['STD-2025-231419-167'],
    },
    {
      name: 'one balance',
      call: (c) => c.account('student-1', admin),
      calls: 'getAccount',
      withArgs: ['student-1'],
    },
    {
      name: 'one statement, paged',
      call: (c) => c.statement('student-1', { page: 3, limit: 20 }, admin),
      calls: 'getStatement',
      withArgs: ['student-1', 3, 20],
    },
    {
      name: 'money taken in',
      call: (c) => c.deposit(money, admin),
      calls: 'deposit',
      /* The last argument is the idempotency key, undefined when the caller
         did not send one. A retry sends the same key and gets the same entry
         rather than a second one. */
      withArgs: ['student-1', 5000, 'Visiting day', admin.id, undefined],
    },
    {
      name: 'money handed over',
      call: (c) => c.withdraw(money, admin),
      calls: 'withdraw',
      withArgs: ['student-1', 5000, 'Visiting day', admin.id],
    },
    {
      name: 'a balance returned to the family',
      call: (c) => c.refund(money, admin),
      calls: 'refund',
      withArgs: ['student-1', 5000, 'Visiting day', admin.id],
    },
    {
      name: 'an entry undone by another entry',
      call: (c) =>
        c.reverse({ transactionId: 't-1', reason: 'Entered twice' }, admin),
      calls: 'reverse',
      withArgs: ['t-1', 'Entered twice', admin.id],
    },
    {
      name: 'a parent setting a daily cap',
      call: (c) =>
        c.limits(
          { studentId: 'student-1', dailyLimit: 2000, lowBalanceAlert: 500 },
          parent,
        ),
      calls: 'updateLimits',
      withArgs: [
        'student-1',
        { dailyLimit: 2000, lowBalanceAlert: 500, isFrozen: undefined },
      ],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * Reading somebody else's account is checked rather than assumed. A role
   * guard cannot make this call: a parent passes it for their own child and
   * must fail it for anyone else's, and only the service knows whose child
   * this is.
   */
  describe('reads of another student are checked', () => {
    it.each([
      ['a balance', (c: any) => c.account('student-1', parent)],
      ['a statement', (c: any) => c.statement('student-1', {}, parent)],
      [
        'a change of limits',
        (c: any) =>
          c.limits({ studentId: 'student-1', dailyLimit: 1000 }, parent),
      ],
    ])('%s', async (_name, call) => {
      await run({
        name: 'checked',
        call,
        calls: 'assertMayView',
        withArgs: [parent.id, parent.role, 'student-1'],
      });
    });

    // The check has to happen before the read, or it is decoration.
    it('refuses before reading anything', async () => {
      service.assertMayView.mockRejectedValueOnce(new Error('Forbidden'));
      const run2 = await controllerHarness(PocketMoneyController, [
        { token: PocketMoneyService, name: 'service', mock: service },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) => c.account('student-1', parent),
          calls: 'getAccount',
        }),
      ).rejects.toThrow();
      expect(service.getAccount).not.toHaveBeenCalled();
    });
  });

  /* The patron serves the boys and the matron the girls. The check runs
     before any money moves, and on the entry's own student for a reversal. */
  it('checks the boarding side before money moves', async () => {
    const patron = { ...admin, role: 'PATRON' };
    const c = () => new PocketMoneyController(service as any);
    await c().deposit(money, patron);
    await c().withdraw(money, patron);
    await c().refund(money, patron);
    expect(service.assertSide).toHaveBeenCalledTimes(3);
    expect(service.assertSide).toHaveBeenCalledWith('PATRON', 'student-1');
    await c().reverse({ transactionId: 't-1', reason: 'Wrong side' }, patron);
    expect(service.assertSideOfEntry).toHaveBeenCalledWith('PATRON', 't-1');
  });
});
