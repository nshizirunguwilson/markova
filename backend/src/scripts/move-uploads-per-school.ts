import { PrismaClient } from '@prisma/client';

import { uploadRoot } from '../common/uploads';
import { moveUploadsPerSchool } from '../common/uploads-move';

/**
 * Run once on an install that saved files before schools had folders:
 *
 *   npm run uploads:per-school -- --dry-run   (see what would move)
 *   npm run uploads:per-school                (move it)
 *
 * In the built image: node dist/scripts/move-uploads-per-school.js
 *
 * Connects as the database owner (DIRECT_DATABASE_URL), which works below the
 * wall between schools. See src/common/uploads-move.ts.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = new PrismaClient({
    datasourceUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  try {
    const report = await moveUploadsPerSchool(db, uploadRoot(), {
      dryRun,
      log: (line) => console.log(`  ${line}`),
    });
    console.log(
      `${dryRun ? 'Would move' : 'Moved'}: ${report.rows} addresses, ${report.filesCopied} files` +
        (report.filesMissing
          ? `, ${report.filesMissing} pointed at files that are not on disk`
          : '') +
        (dryRun ? '' : `, ${report.originalsRemoved} originals removed`),
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
