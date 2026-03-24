import { Module } from '@nestjs/common';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FeesController, PaymentsController],
  providers: [FeesService, PaymentsService],
  exports: [FeesService, PaymentsService],
})
export class FeesModule {}
