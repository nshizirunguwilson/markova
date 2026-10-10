import { AccountsService } from '../modules/accounts/accounts.service';

/**
 * The real AccountsService on a spec's mock database.
 *
 * By default nobody signs in with anything yet, so every person a spec adds
 * gets a new login, which is how the specs were written before logins were
 * split out. A spec about somebody who already uses Markova stubs
 * `prisma.account.findMany` to return their login.
 */
export function accountsFor(prisma: {
  account: { findMany: jest.Mock; create: jest.Mock };
}) {
  if (!prisma.account.findMany.getMockImplementation()) {
    prisma.account.findMany.mockResolvedValue([]);
  }
  if (!prisma.account.create.getMockImplementation()) {
    prisma.account.create.mockResolvedValue({});
  }
  const delivery = {
    email: jest.fn().mockResolvedValue(undefined),
    sms: jest.fn().mockResolvedValue(undefined),
  };
  return new AccountsService(prisma as never, delivery as never);
}
