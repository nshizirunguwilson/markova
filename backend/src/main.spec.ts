const app = {
  set: jest.fn(),
  setGlobalPrefix: jest.fn(),
  useStaticAssets: jest.fn(),
  use: jest.fn(),
  enableCors: jest.fn(),
  useGlobalPipes: jest.fn(),
  useGlobalFilters: jest.fn(),
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

  // Uploaded files are served outside the prefix, because their stored paths
  // are what the database and every printed report card already carry.
  it('serves uploads outside the prefix', async () => {
    await boot({});
    expect(app.useStaticAssets).toHaveBeenCalledWith(
      expect.stringContaining('uploads'),
      { prefix: '/uploads/' },
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
});
