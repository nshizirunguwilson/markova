import { Module } from '@nestjs/common';
import { MarksService } from './marks.service';
import { MarksController } from './marks.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarksController],
  providers: [MarksService],
  exports: [MarksService],
})
export class MarksModule {}
