import { PrismaService } from './prisma.service';

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
