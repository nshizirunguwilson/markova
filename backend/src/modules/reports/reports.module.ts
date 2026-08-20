import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { VerifyController } from './verify.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, VerifyController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
