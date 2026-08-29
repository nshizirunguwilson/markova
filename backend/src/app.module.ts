import { RedisService } from './redis/redis.service';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { validateEnv } from './config/env.validation';
import { Module } from '@nestjs/common';
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
import { HomeworkModule } from './modules/homework/homework.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HelpModule } from './modules/help/help.module';
import { HealthModule } from './modules/health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduledTasksService } from './common/scheduled-tasks.service';
import { AuditLogInterceptor } from './common/interceptors';

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
    HomeworkModule,
    MessagingModule,
    NotificationsModule,
    ReportsModule,
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
  ],
})
export class AppModule {}
