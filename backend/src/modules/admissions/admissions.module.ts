import { Module } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';
import { AdmissionsController } from './admissions.controller';
import { PublicAdmissionsController } from './public-admissions.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [PrismaModule, AccountsModule],
  controllers: [AdmissionsController, PublicAdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
