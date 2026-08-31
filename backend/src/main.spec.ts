const app = {
  set: jest.fn(),
  setGlobalPrefix: jest.fn(),
  useStaticAssets: jest.fn(),
  use: jest.fn(),
  enableCors: jest.fn(),
  useGlobalPipes: jest.fn(),
  useGlobalFilters: jest.fn(),
  useWebSocketAdapter: jest.fn(),
  enableShutdownHooks: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
};

const create = jest.fn().mockResolvedValue(app);
const setup = jest.fn();
const createDocument = jest.fn().mockReturnValue({});

jest.mock('@nestjs/core', () => ({
  NestFactory: { create: (...a: unknown[]) => create(...a) },
}));
jest.mock('./app.module', () => ({ AppModule: class {} }));
jest.mock('./sentry', () => ({}));
/*
  The chat adapter reaches Redis at bootstrap. This spec is about the order
  things are wired in, not about Redis, so it connects instantly here.
*/
const connect = jest.fn().mockResolvedValue(undefined);
jest.mock('./common/redis-io.adapter', () => ({
  RedisIoAdapter: class {
    connect = connect;
  },
}));
jest.mock('helmet', () => ({ __esModule: true, default: () => 'helmet' }));
jest.mock('compression', () => ({
  __esModule: true,
  default: () => 'compression',
}));
jest.mock('@nestjs/swagger', () => ({
  SwaggerModule: {
    createDocument: (...a: unknown[]) => createDocument(...a),
    setup: (...a: unknown[]) => setup(...a),
  },
  DocumentBuilder: class {
    setTitle() {
      return this;
    }
    setDescription() {
      return this;
    }
    setVersion() {
      return this;
    }
    addBearerAuth() {
      return this;
    }
    build() {
      return {};
    }
  },
}));

/**
 * How the API comes up.
 *
 * Three of the decisions here have consequences a person would only discover
 * in production: whether rate limiting can tell one caller from another,
 * which origins may call the API, and whether a map of every route is served
 * publicly.
 */
describe('bootstrap', () => {
  const boot = async (env: Record<string, string | undefined> = {}) => {
    jest.resetModules();
    jest.clearAllMocks();
    const original = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
    }
    // `require` rather than a dynamic import: ts-jest runs in CommonJS, and a
    // dynamic import needs the VM modules flag.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./main');
    // The bootstrap is fired without being awaited at module scope.
    await new Promise((r) => setImmediate(r));
    process.env = original;
  };

  it('serves everything under /api', async () => {
    await boot({});
    expect(app.setGlobalPrefix).toHaveBeenCalledWith(
      'api',
      expect.objectContaining({ exclude: ['uploads/{*path}'] }),
    );
  });

  /**
   * Express answers with the first middleware that matches. A `/uploads/...`
   * request used to reach the static handler before the CORS middleware ran,
   * so it came back with no Access-Control-Allow-Origin header and a
   * `fetch()` from the dashboard was refused by the browser.
   *
   * An <img> does not care, which is why pictures always looked fine. What
   * broke was everything that reads the bytes - a voice note's waveform is
   * decoded with fetch + AudioContext, so every one of them drew a flat line
   * instead of the sound in it.
   */
  it('turns CORS on before it starts serving uploads', async () => {
    await boot({});
    const corsAt = app.enableCors.mock.invocationCallOrder[0];
    const staticAt = app.useStaticAssets.mock.invocationCallOrder[0];
    expect(corsAt).toBeLessThan(staticAt);
  });

  // Uploaded files are served outside the prefix, because their stored paths
  // are what the database and every printed report card already carry.
  /**
   * Express runs middleware in the order it is registered, so anything set up
   * after the static handler never sees a request for an uploaded file. It was
   * registered after Helmet, and /uploads came back with no CSP, no nosniff and
   * no X-Frame-Options while every /api route had all three.
   *
   * Nothing exploited it: the mime allowlist refuses .svg and .html and the
   * stored extension comes from the mime type, so a user cannot put a
   * scriptable file there. The margin is one widened allowlist, and these are
   * served from the API's own origin.
   */
  it('registers helmet before it starts serving uploads', async () => {
    await boot({});
    const helmetAt = app.use.mock.calls.findIndex((c) => c[0] === 'helmet');
    expect(helmetAt).toBeGreaterThanOrEqual(0);
    expect(app.useStaticAssets).toHaveBeenCalled();
    expect(app.use.mock.invocationCallOrder[helmetAt]).toBeLessThan(
      app.useStaticAssets.mock.invocationCallOrder[0],
    );
  });

  /* And the directory gets its own headers on top, so a scriptable file that
     did end up there would run in an opaque origin with nothing to reach. */
  it('sends uploads with nosniff and a sandbox policy', async () => {
    await boot({});
    const options = app.useStaticAssets.mock.calls[0][1];
    const headers: Record<string, string> = {};
    options.setHeaders({
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    });
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Security-Policy']).toContain('sandbox');
  });

  it('serves uploads outside the prefix', async () => {
    await boot({});
    expect(app.useStaticAssets).toHaveBeenCalledWith(
      expect.stringContaining('uploads'),
      expect.objectContaining({ prefix: '/uploads/' }),
    );
  });

  /**
   * Rate limiting keys on the caller's address. Behind a proxy with this
   * unset, every request looks like the proxy, so the ten-per-minute login
   * limit becomes ten logins per minute for the whole school.
   */
  describe('the proxy in front', () => {
    it('is not trusted by default', async () => {
      await boot({ TRUST_PROXY: undefined });
      expect(app.set).not.toHaveBeenCalled();
    });

    it('trusts the number of hops the deployment declares', async () => {
      await boot({ TRUST_PROXY: '1' });
      expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
    });

    it('accepts a named subnet as well as a count', async () => {
      await boot({ TRUST_PROXY: 'loopback' });
      expect(app.set).toHaveBeenCalledWith('trust proxy', 'loopback');
    });

    it('ignores whitespace around the value', async () => {
      await boot({ TRUST_PROXY: '  2  ' });
      expect(app.set).toHaveBeenCalledWith('trust proxy', 2);
    });
  });

  describe('who may call the API', () => {
    it('allows the dashboard and Expo web by default', async () => {
      await boot({ CORS_ORIGINS: undefined });
      expect(app.enableCors).toHaveBeenCalledWith({
        origin: ['http://localhost:3001', 'http://localhost:8081'],
        credentials: true,
      });
    });

    it('allows exactly the origins the deployment names', async () => {
      await boot({ CORS_ORIGINS: 'https://school.rw, https://app.school.rw' });
      expect(app.enableCors.mock.calls[0][0].origin).toEqual([
        'https://school.rw',
        'https://app.school.rw',
      ]);
    });

    it('drops an empty entry rather than allowing a blank origin', async () => {
      await boot({ CORS_ORIGINS: 'https://school.rw,,' });
      expect(app.enableCors.mock.calls[0][0].origin).toEqual([
        'https://school.rw',
      ]);
    });
  });

  /**
   * Every DTO declares the fields it accepts, and this is what makes that
   * declaration binding. Without `forbidNonWhitelisted` an extra field is
   * silently accepted rather than refused.
   */
  it('refuses any field a DTO did not declare', async () => {
    await boot({});
    const pipe = app.useGlobalPipes.mock.calls[0][0];
    expect(pipe.validatorOptions ?? pipe).toBeDefined();
    expect(JSON.stringify(app.useGlobalPipes.mock.calls[0][0])).toContain(
      'forbidNonWhitelisted',
    );
  });

  /**
   * Swagger documents every route, its parameters and its roles: a map of the
   * whole attack surface.
   */
  describe('the API documentation', () => {
    it('is served in development', async () => {
      await boot({ NODE_ENV: 'development', SWAGGER_ENABLED: undefined });
      expect(setup).toHaveBeenCalledWith('api/docs', app, expect.anything());
    });

    it('is off in production', async () => {
      await boot({ NODE_ENV: 'production', SWAGGER_ENABLED: undefined });
      expect(setup).not.toHaveBeenCalled();
    });

    it('can be turned on in production deliberately', async () => {
      await boot({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' });
      expect(setup).toHaveBeenCalled();
    });

    it('can be turned off in development deliberately', async () => {
      await boot({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' });
      expect(setup).not.toHaveBeenCalled();
    });
  });

  /**
   * Without shutdown hooks a redeploy drops Prisma's pool and half-processed
   * jobs on the floor rather than closing them.
   */
  it('closes cleanly on a signal', async () => {
    await boot({});
    expect(app.enableShutdownHooks).toHaveBeenCalled();
  });

  it('listens on the port the deployment set', async () => {
    await boot({ PORT: '8080' });
    expect(app.listen).toHaveBeenCalledWith('8080');
  });

  it('listens on 3000 when none was set', async () => {
    await boot({ PORT: undefined });
    expect(app.listen).toHaveBeenCalledWith(3000);
  });
  /**
   * Chat across more than one instance.
   *
   * A socket.io server keeps its rooms in the memory of the process holding
   * them, so with three instances a message emitted on one never reaches a
   * socket held by another. It fails quietly: perfect between two people who
   * landed on the same instance, silent between two who did not.
   */
  describe('chat across instances', () => {
    it('wires the adapter when there is a Redis to wire it to', async () => {
      await boot({ REDIS_URL: 'redis://localhost:6379' });
      expect(connect).toHaveBeenCalledWith('redis://localhost:6379');
      expect(app.useWebSocketAdapter).toHaveBeenCalled();
    });

    it('leaves it alone when there is no Redis configured', async () => {
      await boot({ REDIS_URL: undefined });
      expect(app.useWebSocketAdapter).not.toHaveBeenCalled();
    });

    /*
      Best effort. A single instance works without the adapter, so refusing to
      boot because Redis was slow to come up would turn a warning into an outage.
    */
    it('still starts when Redis cannot be reached', async () => {
      connect.mockRejectedValueOnce(new Error('connection refused'));
      await boot({ REDIS_URL: 'redis://nope:6379' });
      expect(app.listen).toHaveBeenCalled();
    });
  });
});
