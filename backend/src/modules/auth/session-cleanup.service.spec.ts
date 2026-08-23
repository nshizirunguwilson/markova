import { SessionCleanupService } from './session-cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sweeping up sessions nobody can use any more.
 *
 * The `lt` is what makes this safe. `lte` on a boundary would be harmless;
 * `gt` would sign every single person out overnight, and nothing else in the
 * system would notice until the morning.
 */
describe('SessionCleanupService', () => {
  const prisma = {
    userSession: { deleteMany: jest.fn() },
  } as unknown as PrismaService;

  const deleteMany = (prisma as any).userSession.deleteMany as jest.Mock;

  const build = () => {
    const service = new SessionCleanupService(prisma);
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
    return { service, log };
  };

  beforeEach(() => deleteMany.mockReset().mockResolvedValue({ count: 31 }));

  it('removes only sessions whose expiry has already passed', async () => {
    const { service } = build();
    await service.cleanupExpiredSessions();

    const where = deleteMany.mock.calls[0][0].where;
    expect(Object.keys(where.expiresAt)).toEqual(['lt']);
    expect(where.expiresAt.lt).toBeInstanceOf(Date);
  });

  it('compares against now, not some fixed date', async () => {
    const before = Date.now();
    const { service } = build();
    await service.cleanupExpiredSessions();
    const cutoff: Date = deleteMany.mock.calls[0][0].where.expiresAt.lt;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('says how many it swept up', async () => {
    const { service, log } = build();
    await service.cleanupExpiredSessions();
    expect(log).toHaveBeenCalledWith('Cleaned up 31 expired sessions');
  });

  it('says so on a quiet night too', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    const { service, log } = build();
    await service.cleanupExpiredSessions();
    expect(log).toHaveBeenCalledWith('Cleaned up 0 expired sessions');
  });
});
