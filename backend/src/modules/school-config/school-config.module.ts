import { Module } from '@nestjs/common';
import { SchoolConfigController } from './school-config.controller';
import { PublicConfigController } from './public-config.controller';
import { SchoolConfigService } from './school-config.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CacheService } from '../../common/cache.service';

@Module({
  imports: [PrismaModule],
  // PublicConfigController first so its static /school-config/public route is
  // matched before SchoolConfigController's @Get(':key').
  controllers: [PublicConfigController, SchoolConfigController],
  providers: [SchoolConfigService, CacheService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
