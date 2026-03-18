import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SchoolConfigModule } from './modules/school-config/school-config.module';
import { AcademicModule } from './modules/academic/academic.module';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
