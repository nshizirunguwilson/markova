import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { HomeworkModule } from './modules/homework/homework.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FeesModule } from './modules/fees/fees.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HelpModule } from './modules/help/help.module';
import { HealthModule } from './modules/health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduledTasksService } from './common/scheduled-tasks.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    RedisModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SchoolConfigModule,
    AcademicModule,
    MarksModule,
    AttendanceModule,
    DisciplineModule,
    LibraryModule,
    HomeworkModule,
    MessagingModule,
    NotificationsModule,
    ReportsModule,
    FeesModule,
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
  ],
})
export class AppModule {}
