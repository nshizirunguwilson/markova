import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

import { AcademicModule } from './modules/academic/academic.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClinicModule } from './modules/clinic/clinic.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { DisciplineModule } from './modules/discipline/discipline.module';
import { HealthModule } from './modules/health/health.module';
import { HelpModule } from './modules/help/help.module';
import { HomeworkModule } from './modules/homework/homework.module';
import { LibraryModule } from './modules/library/library.module';
import { MarksModule } from './modules/marks/marks.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PocketMoneyModule } from './modules/pocket-money/pocket-money.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SchoolConfigModule } from './modules/school-config/school-config.module';
import { UsersModule } from './modules/users/users.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/**
 * How the API is put together.
 *
 * A controller that is written, tested and never registered in a module is a
 * feature that does not exist, and nothing else in this suite would notice:
 * its own spec instantiates it directly. The same is true of a module that is
 * never imported into AppModule. So this reads the source tree and checks it
 * against the wiring.
 */

const FEATURE_MODULES = [
  AuthModule,
  UsersModule,
  SchoolConfigModule,
  AcademicModule,
  MarksModule,
  AttendanceModule,
  DisciplineModule,
  LibraryModule,
  PocketMoneyModule,
  ActivitiesModule,
  ClinicModule,
  FinanceModule,
  AdmissionsModule,
  HomeworkModule,
  MessagingModule,
  NotificationsModule,
  ReportsModule,
  AnalyticsModule,
  HelpModule,
  HealthModule,
];

const meta = (module: unknown, key: string): unknown[] =>
  (Reflect.getMetadata(key, module as object) as unknown[]) ?? [];

describe('the module graph', () => {
  it('imports every feature module into the application', () => {
    const imported = meta(AppModule, 'imports');
    for (const feature of FEATURE_MODULES) {
      expect(imported).toContain(feature);
    }
  });

  it('imports the infrastructure the features depend on', () => {
    const imported = meta(AppModule, 'imports');
    expect(imported).toEqual(
      expect.arrayContaining([RedisModule, PrismaModule, CommonModule]),
    );
  });

  it.each(FEATURE_MODULES.map((m) => [m.name, m] as const))(
    '%s declares something',
    (_name, module) => {
      const declared = [
        ...meta(module, 'controllers'),
        ...meta(module, 'providers'),
      ];
      expect(declared.length).toBeGreaterThan(0);
    },
  );
});

/**
 * Every controller in the tree, checked against what the modules register.
 */
describe('every controller is reachable', () => {
  const modulesDir = join(__dirname, 'modules');

  /** Controller class names found on disk, from the source itself. */
  const declared: { file: string; className: string }[] = [];
  for (const feature of readdirSync(modulesDir)) {
    const dir = join(modulesDir, feature);
    // A tree read from disk contains whatever the filesystem left behind.
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.controller.ts')) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      const match = source.match(/export class (\w+Controller)/);
      if (match)
        declared.push({ file: `${feature}/${file}`, className: match[1] });
    }
  }

  const registered = new Set(
    FEATURE_MODULES.flatMap((m) =>
      meta(m, 'controllers').map((c) => (c as { name: string }).name),
    ),
  );

  it('found the controllers on disk', () => {
    // A guard against the check above silently passing on an empty list.
    expect(declared.length).toBeGreaterThanOrEqual(18);
  });

  it.each(declared.map((d) => [d.className, d.file] as const))(
    '%s is registered in a module',
    (className) => {
      expect(registered.has(className)).toBe(true);
    },
  );

  it('registers no controller twice', () => {
    const all = FEATURE_MODULES.flatMap((m) =>
      meta(m, 'controllers').map((c) => (c as { name: string }).name),
    );
    expect(all.length).toBe(new Set(all).size);
  });
});
