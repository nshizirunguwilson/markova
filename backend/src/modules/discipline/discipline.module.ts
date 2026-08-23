import { Module } from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { MeritsService } from './merits.service';
import { DisciplineController } from './discipline.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DisciplineController],
  providers: [DisciplineService, MeritsService],
  exports: [DisciplineService, MeritsService],
})
export class DisciplineModule {}
