import { Module } from '@nestjs/common';
import { SchoolConfigController } from './school-config.controller';
import { SchoolConfigService } from './school-config.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
