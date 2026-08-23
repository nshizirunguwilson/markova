import { of, lastValueFrom } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The audit trail.
 *
 * This is the record a school reaches for when it has to account for what
 * happened: who changed a mark, who deleted a discipline record, from what
 * address. Three things decide whether it is worth having.
 *
 * It has to skip reads, or the table fills with noise and the entries that
 * matter are unfindable. It has to redact, or the trail becomes the single
 * best place in the system to harvest passwords. And a failure to write it
 * must never fail the request, because a school that cannot record a mark
 * because the audit table is full is a school that stops using the system.
 */
describe('AuditLogInterceptor', () => {
  const prisma = {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const create = (prisma as any).auditLog.create as jest.Mock;

  const run = async (
    request: Record<string, unknown>,
    response: unknown = { id: 'created-1' },
  ) => {
    const interceptor = new AuditLogInterceptor(prisma);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
    const next = { handle: () => of(response) };
    const result = await lastValueFrom(interceptor.intercept(context, next));
    return { result, entry: create.mock.calls[0]?.[0]?.data, interceptor };
  };

  beforeEach(() => create.mockClear());

  describe('what gets written down', () => {
    it('records a change to a mark', async () => {
      const { entry } = await run({
        method: 'PUT',
        url: '/api/marks/mark-1',
        user: { id: 'user-1' },
        ip: '41.74.160.1',
        params: { id: 'mark-1' },
        body: { score: 18 },
      });
      expect(entry).toMatchObject({
        userId: 'user-1',
        action: 'PUT',
        entityType: 'marks',
        entityId: 'mark-1',
        ipAddress: '41.74.160.1',
      });
    });

    // A read tells you nothing about what changed, and there are thousands of
    // them for every write.
    it.each(['GET', 'OPTIONS', 'HEAD'])('writes nothing for a %s', async (method) => {
      await run({ method, url: '/api/marks', user: { id: 'u-1' } });
      expect(create).not.toHaveBeenCalled();
    });

    // Only the paths where a change matters to a person's record.
    it('writes nothing for a path nobody needs a trail of', async () => {
      await run({ method: 'POST', url: '/api/library/books', user: { id: 'u-1' } });
      expect(create).not.toHaveBeenCalled();
    });

    it.each(['marks', 'attendance', 'discipline', 'users'])(
      'writes for a change under %s',
      async (path) => {
        await run({ method: 'POST', url: `/api/${path}`, user: { id: 'u-1' } });
        expect(create).toHaveBeenCalled();
      },
    );

    it('falls back to the socket address behind a proxy', async () => {
      const { entry } = await run({
        method: 'POST',
        url: '/api/marks',
        user: { id: 'u-1' },
        socket: { remoteAddress: '10.0.0.1' },
      });
      expect(entry.ipAddress).toBe('10.0.0.1');
    });

    it('records a change made by nobody signed in as nobody', async () => {
      const { entry } = await run({ method: 'POST', url: '/api/users' });
      expect(entry.userId).toBeNull();
      expect(entry.ipAddress).toBeNull();
    });

    // The id of the thing created is only in the response, not the request.
    it('takes the id from the reply when the url had none', async () => {
      const { entry } = await run(
        { method: 'POST', url: '/api/users', user: { id: 'u-1' } },
        { id: 'new-user-9' },
      );
      expect(entry.entityId).toBe('new-user-9');
    });

    it('records no id rather than a wrong one', async () => {
      const { entry } = await run(
        { method: 'POST', url: '/api/users', user: { id: 'u-1' } },
        // A reply with nothing identifying in it, which is what a bulk
        // operation or a plain acknowledgement looks like.
        null,
      );
      expect(entry.entityId).toBeNull();
    });

    it('prefers the route pattern over the raw url', async () => {
      const { entry } = await run({
        method: 'DELETE',
        route: { path: '/api/discipline/incidents/:id' },
        url: '/api/library/nonsense',
        user: { id: 'u-1' },
        params: { id: 'inc-1' },
      });
      expect(entry.entityType).toBe('discipline');
    });

    it('names the last sensitive segment when a path has two', async () => {
      const { entry } = await run({
        method: 'POST',
        url: '/api/users/u-9/attendance',
        user: { id: 'u-1' },
      });
      expect(entry.entityType).toBe('attendance');
    });
  });

  /**
   * The trail records what changed, and a password is never what changed.
   */
  describe('what never gets written down', () => {
    it.each(['password', 'token', 'otp', 'secret', 'refreshToken'])(
      'redacts %s',
      async (key) => {
        const { entry } = await run({
          method: 'POST',
          url: '/api/users',
          user: { id: 'u-1' },
          body: { firstName: 'Divine', [key]: 'the-real-value' },
        });
        expect(entry.newValue).toContain('[REDACTED]');
        expect(entry.newValue).not.toContain('the-real-value');
      },
    );

    it('keeps the rest of the body intact', async () => {
      const { entry } = await run({
        method: 'POST',
        url: '/api/users',
        user: { id: 'u-1' },
        body: { firstName: 'Divine', password: 'x' },
      });
      expect(JSON.parse(entry.newValue)).toEqual({
        firstName: 'Divine',
        password: '[REDACTED]',
      });
    });

    it('does not change the request body itself', async () => {
      const body = { firstName: 'Divine', password: 'secret' };
      await run({ method: 'POST', url: '/api/users', user: { id: 'u-1' }, body });
      expect(body.password).toBe('secret');
    });

    it('records nothing at all for a request with no body', async () => {
      const { entry } = await run({
        method: 'DELETE',
        url: '/api/users/u-9',
        user: { id: 'u-1' },
      });
      expect(entry.newValue).toBeNull();
    });

    // A bulk import can be megabytes. The trail is a record of what happened,
    // not a second copy of the data.
    it('caps a large body rather than storing all of it', async () => {
      const { entry } = await run({
        method: 'POST',
        url: '/api/users',
        user: { id: 'u-1' },
        body: { rows: 'x'.repeat(5000) },
      });
      expect(entry.newValue.length).toBeLessThanOrEqual(2051);
      expect(entry.newValue.endsWith('...')).toBe(true);
    });
  });

  /**
   * A school that cannot record a mark because the audit table is full is a
   * school that stops using the system.
   */
  describe('when the trail itself fails', () => {
    it('still answers the request', async () => {
      const warn = jest
        .spyOn((new AuditLogInterceptor(prisma) as any).logger, 'warn')
        .mockImplementation();
      create.mockRejectedValueOnce(new Error('disk full'));

      const { result } = await run({
        method: 'POST',
        url: '/api/marks',
        user: { id: 'u-1' },
        body: { score: 18 },
      });

      expect(result).toEqual({ id: 'created-1' });
      warn.mockRestore();
    });

    it('says so in the log rather than silently', async () => {
      const interceptor = new AuditLogInterceptor(prisma);
      const warn = jest
        .spyOn((interceptor as any).logger, 'warn')
        .mockImplementation();
      const boom = new Error('disk full');
      create.mockRejectedValueOnce(boom);

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            url: '/api/marks',
            user: { id: 'u-1' },
          }),
        }),
      } as any;
      await lastValueFrom(
        interceptor.intercept(context, { handle: () => of({ id: 'x' }) }),
      );
      await new Promise((r) => setImmediate(r));

      expect(warn).toHaveBeenCalledWith('Failed to write audit log', boom);
    });
  });
});
