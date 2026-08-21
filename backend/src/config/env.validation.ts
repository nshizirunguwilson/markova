/**
 * Boot time environment validation.
 *
 * The app used to start with whatever it was given and only fail later, in the
 * one request that happened to need the missing value. Two of those late
 * failures were silent rather than loud, which is the reason this file exists:
 *
 *  - `JWT_REFRESH_SECRET` unset. `@nestjs/jwt` resolves a secret as
 *    `options.secret || moduleOptions.secret`, so an unset refresh secret falls
 *    back to `JWT_SECRET`. Access and refresh tokens carry the same payload, so
 *    signing both with one key makes a 7 day refresh token usable as a bearer
 *    token wherever a 15 minute access token is expected.
 *  - The shipped `.env.example` values (`change-me`, `change-me-too`) being
 *    carried into a real deployment.
 *
 * Every problem is collected and reported together. Being told about one
 * missing variable per restart is a miserable way to configure a server.
 */

/** Values that are obviously placeholders rather than real secrets. */
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'change-me-too',
  'secret',
  'changeme',
  'your-secret-here',
]);

/** Long enough that brute forcing the signing key is not the weak link. */
const MIN_SECRET_LENGTH = 32;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const problems: string[] = [];
  // Values arrive as `unknown`. Anything that is not a string or a number is
  // not a value this app was given on the command line or in a .env file, so it
  // is treated as absent rather than stringified into '[object Object]'.
  const get = (key: string): string => {
    const value = config[key];
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
  };

  const isProduction = get('NODE_ENV') === 'production';

  if (!get('DATABASE_URL')) {
    problems.push('DATABASE_URL is required.');
  }

  const jwtSecret = get('JWT_SECRET');
  const refreshSecret = get('JWT_REFRESH_SECRET');

  for (const [name, value] of [
    ['JWT_SECRET', jwtSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (!value) {
      problems.push(`${name} is required.`);
      continue;
    }
    if (PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
      problems.push(`${name} is still the example placeholder value.`);
    }
    // Short secrets are tolerated outside production so CI and local runs are
    // not forced to carry production sized strings around.
    if (isProduction && value.length < MIN_SECRET_LENGTH) {
      problems.push(
        `${name} must be at least ${MIN_SECRET_LENGTH} characters in production (got ${value.length}).`,
      );
    }
  }

  // The property this whole file exists to protect. Checked in every
  // environment, because a test suite that passes with one key and a production
  // box that runs with two is a test suite proving the wrong thing.
  if (jwtSecret && refreshSecret && jwtSecret === refreshSecret) {
    problems.push(
      'JWT_SECRET and JWT_REFRESH_SECRET must be different. Signing both token ' +
        'types with one key lets a refresh token be presented as an access token.',
    );
  }

  const port = get('PORT');
  if (port && !/^\d+$/.test(port)) {
    problems.push(`PORT must be a number (got "${port}").`);
  }

  if (isProduction && !get('CORS_ORIGINS')) {
    problems.push(
      'CORS_ORIGINS is required in production. The localhost defaults will not ' +
        'admit your real dashboard.',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        `\n\nSee .env.example for the full list.`,
    );
  }

  return config;
}
