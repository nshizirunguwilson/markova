import { RedisService } from './redis/redis.service';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { validateEnv } from './config/env.validation';
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SchoolConfigModule } from './modules/school-config/school-config.module';
import { AcademicModule } from './modules/academic/academic.module';
import { MarksModule } from './modules/marks/marks.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DisciplineModule } from './modules/discipline/discipline.module';
import { LibraryModule } from './modules/library/library.module';
import { PocketMoneyModule } from './modules/pocket-money/pocket-money.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { ClinicModule } from './modules/clinic/clinic.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { HomeworkModule } from './modules/homework/homework.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HelpModule } from './modules/help/help.module';
import { HealthModule } from './modules/health/health.module';
import { JourneyModule } from './modules/journey/journey.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { FormerStudentInterceptor } from './common/interceptors/former-student.interceptor';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduledTasksService } from './common/scheduled-tasks.service';
import { AuditLogInterceptor } from './common/interceptors';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RlsInterceptor } from './prisma/rls.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // Counters live in Redis so they survive a restart and are shared by every
    // instance. See RedisThrottlerStorage for why the default is not enough.
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ name: 'default', ttl: 60000, limit: 100 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    RedisModule,
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    JourneyModule,
    SharingModule,
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
    JobsModule,
    AuditModule,
    AnalyticsModule,
    HelpModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ScheduledTasksService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    /*
      Tells the database who is asking, so the row level security policies have
      something to read. Registered after the audit log because both are
      interceptors and this one only needs to run before the handler, which it
      does either way.
    */
    // A student who has left sees their past report cards and nothing else.
    {
      provide: APP_INTERCEPTOR,
      useClass: FormerStudentInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * The id goes on at the very front, before anything else can log.
   *
   * `forRoutes('*')` rather than the API prefix: a request for an uploaded
   * file is a request somebody may need to ask about too, and it costs one
   * header either way.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
