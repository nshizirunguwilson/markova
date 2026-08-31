import { validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};

describe('validateEnv()', () => {
  it('accepts a complete configuration', () => {
    expect(() => validateEnv({ ...valid })).not.toThrow();
  });

  it('requires DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL is required/);
  });

  it.each(['JWT_SECRET', 'JWT_REFRESH_SECRET'])('requires %s', (key) => {
    const config: Record<string, unknown> = { ...valid };
    delete config[key];
    expect(() => validateEnv(config)).toThrow(new RegExp(`${key} is required`));
  });

  // The reason this validator exists. An unset refresh secret falls back to
  // JWT_SECRET inside @nestjs/jwt, and since both tokens carry the same payload
  // that makes a refresh token a working access token.
  it('rejects reusing one secret for both token types', () => {
    expect(() =>
      validateEnv({
        ...valid,
        JWT_SECRET: 'same',
        JWT_REFRESH_SECRET: 'same',
      }),
    ).toThrow(/must be different/);
  });

  it('rejects the shipped example placeholders', () => {
    expect(() =>
      validateEnv({
        ...valid,
        JWT_SECRET: 'change-me',
        JWT_REFRESH_SECRET: 'change-me-too',
      }),
    ).toThrow(/placeholder/);
  });

  it('tolerates short secrets outside production', () => {
    expect(() =>
      validateEnv({ ...valid, NODE_ENV: 'test', JWT_SECRET: 'short' }),
    ).not.toThrow();
  });

  it('demands long secrets in production', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://school.example',
      }),
    ).toThrow(/at least 32 characters/);
  });

  it('demands CORS_ORIGINS in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: valid.DATABASE_URL,
        JWT_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'b'.repeat(40),
      }),
    ).toThrow(/CORS_ORIGINS is required/);
  });

  it('rejects a non numeric PORT', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(
      /PORT must be a number/,
    );
  });

  it('reports every problem at once', () => {
    try {
      validateEnv({ JWT_SECRET: 'change-me' });
      fail('expected validateEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL is required');
      expect(message).toContain('JWT_REFRESH_SECRET is required');
      expect(message).toContain('placeholder');
    }
  });
});

/**
 * The secret a student number is signed with.
 *
 * A student number carries an HMAC, so a school running without this secret is
 * issuing numbers anyone can forge. It is required in production; a
 * development run falls back to the JWT secret so nothing has to be set up
 * twice just to see the app work.
 */
describe('the student number secret', () => {
  const production = { ...valid, NODE_ENV: 'production' };
  const longEnough = 'a'.repeat(32);
  // A production run needs its dashboard origin too, or the failure below
  // would be about CORS rather than about the secret under test.
  const prodValid = {
    ...production,
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'https://markova.edu',
  };

  it('is not required in development', () => {
    expect(() => validateEnv({ ...valid })).not.toThrow();
  });

  it('is required in production', () => {
    expect(() => validateEnv({ ...prodValid })).toThrow(
      /STUDENT_ID_SECRET is required in production/,
    );
  });

  it('rejects the shipped example placeholder, even in development', () => {
    expect(() =>
      validateEnv({ ...valid, STUDENT_ID_SECRET: 'change-me' }),
    ).toThrow(/still the example placeholder/);
  });

  it('rejects a placeholder written in another case', () => {
    expect(() =>
      validateEnv({ ...valid, STUDENT_ID_SECRET: 'CHANGE-ME' }),
    ).toThrow(/still the example placeholder/);
  });

  it('rejects a short one in production', () => {
    expect(() =>
      validateEnv({ ...prodValid, STUDENT_ID_SECRET: 'too-short' }),
    ).toThrow(/at least 32 characters in production/);
  });

  it('accepts a short one in development', () => {
    expect(() =>
      validateEnv({ ...valid, STUDENT_ID_SECRET: 'short-but-fine' }),
    ).not.toThrow();
  });

  it('accepts a long one in production', () => {
    expect(() =>
      validateEnv({ ...prodValid, STUDENT_ID_SECRET: longEnough }),
    ).not.toThrow();
  });
});

/**
 * Values that did not come from a .env file.
 *
 * Everything arrives as `unknown`. A number is a value somebody set; an
 * object is not, and stringifying it would put "[object Object]" into a
 * connection string.
 */
describe('values of the wrong shape', () => {
  it('takes a port given as a number', () => {
    expect(() => validateEnv({ ...valid, PORT: 3000 })).not.toThrow();
  });

  it('treats an object as if nothing was set', () => {
    expect(() =>
      validateEnv({ ...valid, DATABASE_URL: { host: 'localhost' } }),
    ).toThrow(/DATABASE_URL is required/);
  });

  it('treats null as if nothing was set', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: null })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it('trims the spaces off a value', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: '  production  ' })).toThrow(
      /at least 32 characters in production/,
    );
  });

  /**
   * The application must not connect as the database owner.
   *
   * Row level security is what stops a forgotten `where` clause returning
   * another family's records, and a superuser bypasses every policy no matter
   * how the table is configured. Connecting as the owner does not fail or warn:
   * the policies are simply not applied, and the leak is silent.
   *
   * This test exists because that is exactly what happened. The non-owner role
   * was created and proved to work, and every config kept using the owner, so
   * the isolation was enabled and doing nothing at all.
   */
  describe('which role the application connects as', () => {
    /* Long secrets because production also requires a minimum length, and
       this block is about the role rather than about the secrets. */
    const production = {
      ...valid,
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      STUDENT_ID_SECRET: 'c'.repeat(48),
      CORS_ORIGINS: 'https://school.example',
    };

    const inProduction = (url: string) => () =>
      validateEnv({ ...production, DATABASE_URL: url });

    it('refuses the schema owner in production', () => {
      expect(
        inProduction('postgresql://markova:pw@localhost:5432/markova'),
      ).toThrow(/bypasses every row level security policy/);
    });

    it('refuses the default superuser too', () => {
      expect(
        inProduction('postgresql://postgres:pw@localhost:5432/markova'),
      ).toThrow(/owns the schema/);
    });

    it('accepts the application role', () => {
      expect(
        inProduction('postgresql://markova_app:pw@localhost:5432/markova'),
      ).not.toThrow();
    });

    it('reads the role whatever case it is written in', () => {
      expect(
        inProduction('postgresql://MARKOVA:pw@localhost:5432/markova'),
      ).toThrow(/owns the schema/);
    });

    /* Development runs a single role for convenience, and a developer's own
       machine holds no real family's records. The check is about deployments. */
    it('leaves development alone', () => {
      expect(() =>
        validateEnv({
          ...valid,
          DATABASE_URL: 'postgresql://markova:pw@localhost:5432/markova',
        }),
      ).not.toThrow();
    });
  });
});
