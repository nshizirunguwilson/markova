import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
