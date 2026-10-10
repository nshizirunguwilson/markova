import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PublicSchoolService } from './public-school.service';

@Global()
@Module({
  providers: [PrismaService, PublicSchoolService],
  exports: [PrismaService, PublicSchoolService],
})
export class PrismaModule {}
