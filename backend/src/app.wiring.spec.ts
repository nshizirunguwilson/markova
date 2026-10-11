import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

import { AcademicModule } from './modules/academic/academic.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
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
import { JourneyModule } from './modules/journey/journey.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { SupportModule } from './modules/support/support.module';
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
  AuditModule,
  AuthModule,
  UsersModule,
  JourneyModule,
  SharingModule,
  SupportModule,
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

  /**
   * A service that injects something its module never imported.
   *
   * This is the shape of bug that every unit test in this repository is blind
   * to, because a unit test constructs the service directly and hands it a
   * stub. Nest only discovers it when the application actually boots, so it
   * showed up as three containers restart-looping with a full green suite
   * behind them.
   *
   * Reading the source rather than booting: a full Nest bootstrap here would
   * need a database, a Redis and a browser, and the point is to fail fast in
   * the unit suite.
   */
  describe('services only inject what their module imports', () => {
    /** Providers that come from a module rather than from the feature itself. */
    const FROM_MODULE: Record<string, string> = {
      DeliveryQueue: 'JobsModule',
      RenderQueue: 'JobsModule',
    };

    const featureFiles = () => {
      const out: { module: string; file: string; source: string }[] = [];
      for (const feature of readdirSync(modulesDir)) {
        const dir = join(modulesDir, feature);
        if (!statSync(dir).isDirectory()) continue;
        for (const file of readdirSync(dir)) {
          if (!file.endsWith('.service.ts') || file.endsWith('.spec.ts'))
            continue;
          out.push({
            module: feature,
            file,
            source: readFileSync(join(dir, file), 'utf8'),
          });
        }
      }
      return out;
    };

    it.each(Object.entries(FROM_MODULE))(
      'every service injecting %s sits in a module importing %s',
      (provider, owningModule) => {
        for (const { module, file, source } of featureFiles()) {
          /* Constructor injection only. A type import alone is not a
             dependency and does not need the module. */
          const injects = new RegExp(
            `(private|public|protected)\\s+(readonly\\s+)?\\w+:\\s*${provider}\\b`,
          ).test(source);
          if (!injects) continue;

          const modulePath = join(modulesDir, module, `${module}.module.ts`);
          const moduleSource = readFileSync(modulePath, 'utf8');

          /*
            The `imports:` array specifically, not the file.

            A module that injects the provider almost always has the import
            statement at the top as well, so searching the whole source finds
            that line and passes whether or not the module is actually
            imported. That is the exact bug this is here to catch, and the
            first version of this test had it.
          */
          const importsArray = /imports:\s*\[([\s\S]*?)\]/.exec(moduleSource);
          const wired = (importsArray?.[1] ?? '').includes(owningModule);

          /* Jest's expect takes no message argument, so the explanation goes
             in the assertion itself: a failure prints the module name rather
             than only "expected true". */
          expect(
            `${module}/${file} needs ${owningModule} in imports: ${wired}`,
          ).toBe(`${module}/${file} needs ${owningModule} in imports: true`);
        }
      },
    );
  });
});
