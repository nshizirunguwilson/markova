import { Module } from '@nestjs/common';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CacheService } from '../../common/cache.service';

@Module({
  imports: [PrismaModule],
  controllers: [AcademicController],
  providers: [AcademicService, CacheService],
  exports: [AcademicService],
})
export class AcademicModule {}
