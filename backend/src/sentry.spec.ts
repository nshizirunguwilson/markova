const init = jest.fn();
jest.mock('@sentry/nestjs', () => ({ init: (...a: unknown[]) => init(...a) }));

/**
 * Error reporting.
 *
 * Off unless a DSN is configured, because a school self-hosting this has no
 * Sentry account and should not have its stack traces attempting to leave the
 * building.
 */
describe('sentry', () => {
  const load = (env: Record<string, string | undefined>) => {
    jest.resetModules();
    init.mockClear();
    const original = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./sentry');
    process.env = original;
  };

  it('does nothing at all without a DSN', () => {
    load({ SENTRY_DSN: undefined });
    expect(init).not.toHaveBeenCalled();
  });

  it('starts when a DSN is configured', () => {
    load({ SENTRY_DSN: 'https://key@sentry.io/1', NODE_ENV: 'production' });
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@sentry.io/1',
        environment: 'production',
      }),
    );
  });

  // Sampling every trace in production would cost a school money for data
  // nobody reads; sampling everything in development is what makes it useful.
  it('samples a fifth of traces in production and all of them elsewhere', () => {
    load({ SENTRY_DSN: 'https://key@sentry.io/1', NODE_ENV: 'production' });
    expect(init.mock.calls[0][0].tracesSampleRate).toBe(0.2);

    load({ SENTRY_DSN: 'https://key@sentry.io/1', NODE_ENV: 'development' });
    expect(init.mock.calls[0][0].tracesSampleRate).toBe(1.0);
  });

  it('calls the environment development when none is named', () => {
    load({ SENTRY_DSN: 'https://key@sentry.io/1', NODE_ENV: undefined });
    expect(init.mock.calls[0][0].environment).toBe('development');
  });
});
