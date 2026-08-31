import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Prisma's own configuration, moved out of package.json.
 *
 * The `prisma` block in package.json is deprecated and Prisma 7 drops it
 * entirely, so a project that leaves it there cannot take the upgrade without
 * its seed silently ceasing to run. That is the kind of breakage that shows up
 * as an empty demo database rather than as an error.
 *
 * Nothing else changes: the same seed, run the same way.
 *
 * `dotenv/config` is imported first, and it has to be. Prisma reads .env
 * itself only when there is no config file; the moment this file exists that
 * stops, and DATABASE_URL comes back undefined with an error that points at
 * the schema rather than at this change.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    /*
      ts-node with CommonJS because the seed is TypeScript and this project is
      CommonJS. Prisma runs this as a child process, so it does not inherit the
      compiler options the API is built with.
    */
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
});
