import { PrismaService, identityExtension } from './prisma.service';
import {
  withIdentityApplied,
  withPlatform,
  withRequestContext,
} from './request-context';

/**
 * The database handle.
 *
 * Fourteen lines, and the only thing they do is tie the connection to the
 * application's own lifecycle. Getting that wrong means either an API that
 * accepts requests before it can serve them, or a process that will not exit.
 */
describe('PrismaService', () => {
  it('opens the connection when the application starts', async () => {
    const service = new PrismaService();
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();
    expect(connect).toHaveBeenCalled();
  });

  // Without this the process hangs on shutdown with an open pool, which in a
  // container means the orchestrator kills it rather than it stopping.
  it('closes the connection when the application stops', async () => {
    const service = new PrismaService();
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it('is a Prisma client, so every model is reachable through it', () => {
    const service = new PrismaService();
    expect(service.student).toBeDefined();
    expect(service.$transaction).toBeInstanceOf(Function);
  });
});

/**
 * Telling the database who is asking (the wall between schools). The real
 * thing is proven against PostgreSQL in test/wall.e2e-spec.ts; these drive
 * the extension itself with a stand-in client, so each rule is pinned here.
 */
describe('identityExtension', () => {
  let extension: any;
  let executeRaw: jest.Mock;
  let transaction: jest.Mock;

  beforeEach(() => {
    executeRaw = jest.fn((...args: unknown[]) => ({ raw: args }));
    transaction = jest.fn((arg: unknown) =>
      Promise.resolve(
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ $executeRaw: executeRaw })
          : ['set', 'result'],
      ),
    );
    const base = { $executeRaw: executeRaw, $transaction: transaction };
    const made: unknown = identityExtension(base as never);
    // defineExtension hands back either the extension or a function of the
    // client that applies it; either way, catch what reaches $extends.
    const client = {
      $extends: (config: unknown) => {
        extension = config;
        return client;
      },
    };
    if (typeof made === 'function') made(client);
    else extension = made;
  });

  const asSent = (call: unknown[]) => call.slice(1);

  it('runs a query as it is when nobody is in context', async () => {
    const query = jest.fn().mockResolvedValue('rows');
    expect(await extension.query.$allOperations({ args: {}, query })).toBe(
      'rows',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('sends who is asking with each query, in one round trip', async () => {
    const query = jest.fn().mockReturnValue('the query');
    const result = await withRequestContext(
      { userId: 'u1', role: 'PARENT', schoolId: 's1' },
      () => extension.query.$allOperations({ args: {}, query }),
    );
    expect(result).toBe('result');
    expect(transaction.mock.calls[0][0]).toHaveLength(2);
    expect(asSent(executeRaw.mock.calls[0])).toEqual([
      'PARENT',
      'u1',
      's1',
      '',
    ]);
  });

  it('turns the bypass on only for platform work', async () => {
    const query = jest.fn();
    await withPlatform(() =>
      extension.query.$allOperations({ args: {}, query }),
    );
    expect(asSent(executeRaw.mock.calls[0])).toEqual(['', '', '', 'on']);
  });

  it('does not say it twice inside a transaction that already has', async () => {
    const query = jest.fn().mockResolvedValue('inner');
    const result = await withRequestContext({ schoolId: 's1' }, () =>
      withIdentityApplied(() =>
        extension.query.$allOperations({ args: {}, query }),
      ),
    );
    expect(result).toBe('inner');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('sets the school at the start of a callback transaction', async () => {
    const work = jest.fn().mockResolvedValue('done');
    const result = await withRequestContext(
      { schoolId: 's1', role: 'ADMIN' },
      () => extension.client.$transaction(work, { timeout: 5 }),
    );
    expect(result).toBe('done');
    expect(asSent(executeRaw.mock.calls[0])).toEqual(['ADMIN', '', 's1', '']);
    expect(transaction.mock.calls[0][1]).toEqual({ timeout: 5 });
  });

  it('refuses the list form while somebody is in context', () => {
    expect(() =>
      withRequestContext({ schoolId: 's1' }, () =>
        extension.client.$transaction([1, 2]),
      ),
    ).toThrow(/callback form can carry the school/);
  });

  it('passes either form straight through with nobody in context', async () => {
    expect(await extension.client.$transaction(['a'])).toEqual([
      'set',
      'result',
    ]);
    const work = jest.fn().mockResolvedValue('plain');
    expect(await extension.client.$transaction(work)).toBe('plain');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe('the current school', () => {
  it('is the one in context, and refused where there is none', async () => {
    const service = new PrismaService();
    await expect(
      withRequestContext({ schoolId: 's1' }, () => service.currentSchoolId()),
    ).resolves.toBe('s1');
    await expect(service.currentSchoolId()).rejects.toThrow(
      /No school in context/,
    );
  });
});
