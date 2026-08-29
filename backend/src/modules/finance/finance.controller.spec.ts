import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import {
  buildController,
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/**
 * The fee routes.
 *
 * Two things are worth asserting at this layer. The delegation, because a
 * copied route pointing at the wrong service method would take a payment
 * against the wrong term. And the ownership check on the family-facing
 * routes, because forgetting it there is how one parent comes to read
 * another family's balance.
 */
describe('FinanceController', () => {
  const service = mockService([
    'feeStructure',
    'saveFeeItem',
    'deleteFeeItem',
    'copyFeeStructure',
    'raiseInvoices',
    'register',
    'summary',
    'account',
    'history',
    'recordPayment',
    'voidPayment',
    'grantWaiver',
    'revokeWaiver',
    'assertMayViewAccount',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(FinanceController, [
      { token: FinanceService, name: 'service', mock: service },
    ]);
  });

  const admin = { id: 'user-1', role: 'ADMIN' };

  const cases: RouteCase[] = [
    {
      name: 'the term’s price list',
      call: (c) => c.structure('term-1'),
      calls: 'feeStructure',
      withArgs: ['term-1'],
    },
    {
      name: 'a fee line saved',
      call: (c) => c.saveItem({ name: 'Tuition' }),
      calls: 'saveFeeItem',
      withArgs: [{ name: 'Tuition' }],
    },
    {
      name: 'a fee line removed',
      call: (c) => c.deleteItem('item-1'),
      calls: 'deleteFeeItem',
      withArgs: ['item-1'],
    },
    {
      name: 'a price list copied onto another term',
      call: (c) => c.copyStructure({ fromTermId: 't-1', toTermId: 't-2' }),
      calls: 'copyFeeStructure',
      withArgs: ['t-1', 't-2'],
    },
    {
      name: 'the term’s invoices raised',
      call: (c) => c.raise({ termId: 'term-1', classSectionId: 'sec-1' }),
      calls: 'raiseInvoices',
      withArgs: ['term-1', 'sec-1'],
    },
    {
      name: 'every student’s standing',
      call: (c) => c.register({ termId: 'term-1' }),
      calls: 'register',
      withArgs: [{ termId: 'term-1' }],
    },
    {
      name: 'the term at a glance',
      call: (c) => c.summary('term-1'),
      calls: 'summary',
      withArgs: ['term-1'],
    },
    {
      name: 'a payment taken',
      call: (c) => c.recordPayment({ amount: 1000 }, admin),
      calls: 'recordPayment',
      withArgs: [{ amount: 1000 }, 'user-1'],
    },
    {
      name: 'a receipt voided',
      call: (c) => c.voidPayment({ paymentId: 'p-1', reason: 'twice' }, admin),
      calls: 'voidPayment',
      withArgs: ['p-1', 'twice', 'user-1'],
    },
    {
      name: 'a waiver granted',
      call: (c) => c.grantWaiver({ amount: 1000 }, admin),
      calls: 'grantWaiver',
      withArgs: [{ amount: 1000 }, 'user-1'],
    },
    {
      name: 'a waiver withdrawn',
      call: (c) => c.revokeWaiver({ waiverId: 'w-1', reason: 'gone' }, admin),
      calls: 'revokeWaiver',
      withArgs: ['w-1', 'gone', 'user-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * The two routes a family reaches. Each one asks first whose account it is;
   * without that a parent could read any balance in the school by changing
   * the id in the URL.
   */
  describe('an account a family can reach', () => {
    it.each([
      [
        'one term',
        'account',
        (c: any) => c.account('stu-1', 'term-1', { id: 'u-1', role: 'PARENT' }),
      ],
      [
        'every term',
        'history',
        (c: any) => c.history('stu-1', { id: 'u-1', role: 'PARENT' }),
      ],
    ])('checks whose account it is before reading %s', async (_n, _m, call) => {
      const ctl: any = await buildController(FinanceController, [
        { token: FinanceService, name: 'service', mock: service },
      ]);
      await call(ctl);
      expect(service.assertMayViewAccount).toHaveBeenCalledWith(
        'u-1',
        'PARENT',
        'stu-1',
      );
    });

    it('reads the term asked for once the check passes', async () => {
      await run({
        name: 'account',
        call: (c) => c.account('stu-1', 'term-1', admin),
        calls: 'account',
        withArgs: ['stu-1', 'term-1'],
      });
    });

    it('reads the whole history once the check passes', async () => {
      await run({
        name: 'history',
        call: (c) => c.history('stu-1', admin),
        calls: 'history',
        withArgs: ['stu-1'],
      });
    });

    /*
      A refusal must stop the read, not merely be recorded beside it.
    */
    it('does not read the account when the check refuses', async () => {
      const ctl: any = await buildController(FinanceController, [
        { token: FinanceService, name: 'service', mock: service },
      ]);
      service.assertMayViewAccount.mockRejectedValueOnce(new Error('nope'));
      await expect(
        ctl.account('stu-1', 'term-1', { id: 'u-1', role: 'PARENT' }),
      ).rejects.toThrow();
      expect(service.account).not.toHaveBeenCalled();
    });
  });
});
