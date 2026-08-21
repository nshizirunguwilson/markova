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
    expect(() => validateEnv(config)).toThrow(
      new RegExp(`${key} is required`),
    );
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
