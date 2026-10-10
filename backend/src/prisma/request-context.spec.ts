import { currentRequest, withRequestContext } from './request-context';

/**
 * Who the current request belongs to.
 *
 * Node serves many requests concurrently on one thread, so this cannot be a
 * module-level variable: it would be whichever request wrote to it last, and
 * the failure would be one family seeing another's data under load and never
 * in testing.
 */
describe('the request context', () => {
  it('is null outside a request', () => {
    expect(currentRequest()).toBeNull();
  });

  it('carries the identity to anything called inside it', () => {
    withRequestContext({ userId: 'u-1', role: 'PARENT' }, () => {
      expect(currentRequest()).toEqual({ userId: 'u-1', role: 'PARENT' });
    });
  });

  it('reaches through an await, not just a direct call', async () => {
    await withRequestContext({ userId: 'u-1', role: 'PARENT' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(currentRequest()?.userId).toBe('u-1');
    });
  });

  it('is gone again once the request is over', () => {
    withRequestContext({ userId: 'u-1', role: 'PARENT' }, () => undefined);
    expect(currentRequest()).toBeNull();
  });

  /*
    The one that matters. Two requests interleaved on one thread must not see
    each other's identity, which is exactly what a shared variable would do and
    exactly the bug that would only appear under load.
  */
  it('keeps two overlapping requests apart', async () => {
    const seen: string[] = [];
    await Promise.all([
      withRequestContext({ userId: 'parent-a', role: 'PARENT' }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(currentRequest()!.userId!);
      }),
      withRequestContext({ userId: 'parent-b', role: 'PARENT' }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(currentRequest()!.userId!);
      }),
    ]);
    expect(seen.sort()).toEqual(['parent-a', 'parent-b']);
  });
});
