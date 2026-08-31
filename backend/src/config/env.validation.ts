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

/**
 * Roles that own the schema, and so bypass row level security.
 *
 * `postgres` is the default superuser everywhere; `markova` is the owner this
 * project's migrations create and run as.
 */
const OWNER_ROLES = new Set(['postgres', 'markova']);

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

  // A student number carries an HMAC, so a school that runs without this
  // secret is issuing numbers anyone can forge. Required in production; a
  // development run falls back to the JWT secret so nothing has to be set up
  // twice to see the app work.
  const idSecret = get('STUDENT_ID_SECRET');
  if (!idSecret) {
    if (isProduction) {
      problems.push(
        'STUDENT_ID_SECRET is required in production. Student numbers are ' +
          'signed with it, and without one they can be forged.',
      );
    }
  } else if (PLACEHOLDER_SECRETS.has(idSecret.toLowerCase())) {
    problems.push('STUDENT_ID_SECRET is still the example placeholder value.');
  } else if (isProduction && idSecret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `STUDENT_ID_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production (got ${idSecret.length}).`,
    );
  }

  /*
    The application must not connect as the database owner.

    Row level security is what stops a forgotten `where` clause returning
    another family's records, and a superuser bypasses every policy no matter
    how the table is configured. Connecting as the owner does not fail, warn,
    or look any different: the policies are simply not applied, and the leak is
    silent.

    This exists because that is exactly what happened. The non-owner role was
    created and proved to work, and every config kept using the owner, so the
    isolation was enabled and doing nothing.
  */
  const databaseUrl = get('DATABASE_URL');
  if (databaseUrl && isProduction) {
    const user = /^postgres(?:ql)?:\/\/([^:@/]+)/.exec(databaseUrl)?.[1];
    if (user && OWNER_ROLES.has(user.toLowerCase())) {
      problems.push(
        `DATABASE_URL connects as "${user}", which owns the schema. A superuser ` +
          'bypasses every row level security policy, so one family could read ' +
          "another's records with nothing to show it happened. Connect as the " +
          'application role and leave the owner to DIRECT_DATABASE_URL.',
      );
    }
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
