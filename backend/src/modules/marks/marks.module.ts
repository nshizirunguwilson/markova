import { Module } from '@nestjs/common';
import { MarksService } from './marks.service';
import { HeadTeacherDashboardService } from './head-teacher-dashboard.service';
import { MarksController } from './marks.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { Permissions } from '../../common/permissions';

@Module({
  imports: [PrismaModule],
  controllers: [MarksController],
  providers: [MarksService, HeadTeacherDashboardService, Permissions],
  exports: [MarksService],
})
export class MarksModule {}
