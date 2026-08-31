import { forwardRef, Module } from '@nestjs/common';

import { JobsModule } from '../../jobs/jobs.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { VerifyController } from './verify.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  /*
    forwardRef because the queue needs the reports service to do the rendering
    and the reports controller needs the queue to accept work. Two modules
    that genuinely depend on each other, rather than a layering mistake.
  */
  imports: [PrismaModule, forwardRef(() => JobsModule)],
  controllers: [ReportsController, VerifyController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
