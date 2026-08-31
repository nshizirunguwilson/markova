import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from './request-id.middleware';

/**
 * Following one request through three servers.
 *
 * With one server you find a request in the log by its timestamp. With three
 * behind a balancer you cannot: the lines are interleaved across three files,
 * a retry looks like a second unrelated request, and a websocket event has no
 * visible connection to the call that caused it.
 */
describe('the request id', () => {
  const middleware = new RequestIdMiddleware();

  const run = (headers: Record<string, unknown> = {}) => {
    const req = { headers } as never as { id: string; headers: unknown };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use(req as never, res as never, next);
    return { req, res, next };
  };

  it('gives a request without one an id of its own', () => {
    const { req } = run();
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('always carries on down the chain', () => {
    expect(run().next).toHaveBeenCalled();
  });

  /* Handed back so a person reporting a problem can quote it, and so the
     dashboard can attach it to an error it shows. */
  it('sends the id back on the response', () => {
    const { req, res } = run();
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
  });

  /*
    nginx generates one, and so does the dashboard for a request it wants to
    ask about later. Overwriting it would break the trail exactly where it
    starts.
  */
  it('honours an id that arrived with the request', () => {
    expect(run({ [REQUEST_ID_HEADER]: 'edge-7f3a91c2' }).req.id).toBe(
      'edge-7f3a91c2',
    );
  });

  it('takes the first when a proxy sent several', () => {
    expect(
      run({ [REQUEST_ID_HEADER]: ['first-abc123', 'second'] }).req.id,
    ).toBe('first-abc123');
  });

  /*
    This is attacker-controlled text on its way into log files that people grep
    and tools parse. A newline in the middle of an id is a forged log line, so
    anything outside the allowed characters is dropped rather than escaped.
  */
  it('strips what an id cannot hold, rather than escaping it', () => {
    const { req } = run({
      [REQUEST_ID_HEADER]: 'abc123\n2026-01-01 ERROR faked line',
    });
    expect(req.id).not.toContain('\n');
    expect(req.id).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('caps the length so one request cannot bloat every line', () => {
    const { req } = run({ [REQUEST_ID_HEADER]: 'a'.repeat(500) });
    expect(req.id.length).toBeLessThanOrEqual(64);
  });

  /* Too short to be anybody's real id, so it is more likely noise than a
     trail worth keeping. */
  it('replaces one too short to have come from a real tracer', () => {
    expect(run({ [REQUEST_ID_HEADER]: 'x' }).req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces one that is not text at all', () => {
    expect(run({ [REQUEST_ID_HEADER]: 42 }).req.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
