import * as Sentry from '@sentry/react-native';

/**
 * What the app does when something breaks in a classroom.
 *
 * In development a crash should be loud and in the console. In a school's
 * hands it should be quiet on screen and reported instead, with enough
 * context to say which screen and which user, and no more than that.
 */

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const sentry = Sentry as jest.Mocked<typeof Sentry>;

// __DEV__ is baked in at load, so each mode needs its own load of the module.
function loadIn(mode: 'development' | 'production') {
  let mod!: typeof import('./error-reporting');
  const wasDev = (globalThis as any).__DEV__;
  (globalThis as any).__DEV__ = mode === 'development';
  jest.isolateModules(() => {
    mod = require('./error-reporting');
  });
  (globalThis as any).__DEV__ = wasDev;
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('in a school, where nobody is watching a console', () => {
  it('reports a crash rather than printing it', () => {
    const { errorReporter } = loadIn('production');
    const boom = new Error('Marks screen fell over');

    errorReporter.captureException(boom, { screen: 'marks' });

    expect(sentry.captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        extra: expect.objectContaining({ screen: 'marks' }),
      }),
    );
  });

  // Something thrown that is not an Error still has to arrive as one, or the
  // report is a bare string with no stack behind it.
  it('makes a real error out of whatever was thrown', () => {
    const { errorReporter } = loadIn('production');

    errorReporter.captureException('just a string');

    const [reported] = sentry.captureException.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toBe('just a string');
  });

  it('attaches whoever was signed in when it broke', () => {
    const { errorReporter } = loadIn('production');
    errorReporter.setUser('user-1');

    errorReporter.captureException(new Error('boom'));

    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(sentry.captureException.mock.calls[0][1]).toMatchObject({
      extra: { userId: 'user-1' },
    });
  });

  it('lets a caller name a different user than the signed-in one', () => {
    const { errorReporter } = loadIn('production');
    errorReporter.setUser('user-1');

    errorReporter.captureException(new Error('boom'), { userId: 'user-2' });

    expect(sentry.captureException.mock.calls[0][1]).toMatchObject({
      extra: { userId: 'user-2' },
    });
  });

  // Signing out has to forget who it was, or the next person's crashes are
  // filed under the last person's name.
  it('forgets the user when the session ends', () => {
    const { errorReporter } = loadIn('production');
    errorReporter.setUser('user-1');

    errorReporter.setUser(null);

    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  it('sends a plain message at the level it was given', () => {
    const { errorReporter } = loadIn('production');

    errorReporter.captureMessage('Sync finished late', 'warning');

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Sync finished late',
      'warning',
    );
  });

  it('treats a message with no level as information', () => {
    const { errorReporter } = loadIn('production');

    errorReporter.captureMessage('Opened the register');

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Opened the register',
      'info',
    );
  });
});

describe('in development, where somebody is', () => {
  it('prints a crash instead of sending it anywhere', () => {
    const console_ = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { errorReporter } = loadIn('development');

    errorReporter.captureException(new Error('boom'), { screen: 'marks' });

    expect(console_).toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    console_.mockRestore();
  });

  it('prints a message instead of sending it', () => {
    const console_ = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { errorReporter } = loadIn('development');

    errorReporter.captureMessage('Opened the register');

    expect(console_).toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    console_.mockRestore();
  });
});

/**
 * A breadcrumb is the trail that makes a report readable: which screens the
 * user passed through before it broke. It is recorded in both modes, because
 * it is what a later crash is read against.
 */
describe('the trail left before a crash', () => {
  it('records where the user had been, in either mode', () => {
    const console_ = jest.spyOn(console, 'log').mockImplementation(() => {});

    loadIn('production').errorReporter.addBreadcrumb('nav', 'opened marks');
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'nav',
      message: 'opened marks',
      data: undefined,
    });

    loadIn('development').errorReporter.addBreadcrumb('nav', 'opened marks', {
      classId: 'c1',
    });
    expect(console_).toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(2);

    console_.mockRestore();
  });
});

describe('catching what nothing else caught', () => {
  const originalErrorUtils = (globalThis as any).ErrorUtils;

  afterEach(() => {
    (globalThis as any).ErrorUtils = originalErrorUtils;
    delete (globalThis as any).onunhandledrejection;
  });

  it('reports an uncaught crash and still lets the red screen show', () => {
    const previous = jest.fn();
    let installed!: (error: Error, isFatal?: boolean) => void;
    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: any) => {
        installed = h;
      },
    };
    const console_ = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mod = loadIn('development');
    mod.setupGlobalErrorHandling();

    const boom = new Error('nothing caught this');
    installed(boom, true);

    expect(console_).toHaveBeenCalledWith(
      '[ErrorReporter]',
      'nothing caught this',
      expect.objectContaining({ action: 'fatal_error' }),
    );
    expect(previous).toHaveBeenCalledWith(boom, true);
    console_.mockRestore();
  });

  it('marks a non-fatal crash as one the app survived', () => {
    let installed!: (error: Error, isFatal?: boolean) => void;
    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => undefined,
      setGlobalHandler: (h: any) => {
        installed = h;
      },
    };
    const console_ = jest.spyOn(console, 'error').mockImplementation(() => {});

    loadIn('development').setupGlobalErrorHandling();
    installed(new Error('survivable'), false);

    expect(console_).toHaveBeenCalledWith(
      '[ErrorReporter]',
      'survivable',
      expect.objectContaining({ action: 'unhandled_error' }),
    );
    console_.mockRestore();
  });

  it('reports a promise nobody handled, and keeps the old handler', () => {
    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => undefined,
      setGlobalHandler: jest.fn(),
    };
    const previous = jest.fn();
    (globalThis as any).onunhandledrejection = previous;
    const console_ = jest.spyOn(console, 'error').mockImplementation(() => {});

    loadIn('development').setupGlobalErrorHandling();
    const event = { reason: new Error('dropped promise') };
    (globalThis as any).onunhandledrejection(event);

    expect(console_).toHaveBeenCalledWith(
      '[ErrorReporter]',
      'dropped promise',
      expect.objectContaining({ action: 'unhandled_promise_rejection' }),
    );
    expect(previous).toHaveBeenCalledWith(event);
    console_.mockRestore();
  });

  it('copes with a rejection that carries no reason', () => {
    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => undefined,
      setGlobalHandler: jest.fn(),
    };
    const console_ = jest.spyOn(console, 'error').mockImplementation(() => {});

    loadIn('development').setupGlobalErrorHandling();
    (globalThis as any).onunhandledrejection({});

    expect(console_).toHaveBeenCalledWith(
      '[ErrorReporter]',
      'Unhandled promise rejection',
      expect.anything(),
    );
    console_.mockRestore();
  });
});

describe('wiring the reporter up at all', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it('stays switched off when no school configured a destination', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    loadIn('production');

    expect(sentry.init).not.toHaveBeenCalled();
  });

  // A school running this in production does not want every screen view
  // shipped off; a fifth of traces is enough to spot a slow report.
  it('samples lightly once a destination is configured', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@sentry.example/1';
    loadIn('production');

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@sentry.example/1',
        tracesSampleRate: 0.2,
        enableAutoSessionTracking: true,
      }),
    );
  });

  it('traces everything while somebody is building it', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@sentry.example/1';
    loadIn('development');

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 1.0 }),
    );
  });
});
