import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PhotoConsentController } from './photo-consent.controller';
import { PhotoConsentService } from './photo-consent.service';

@Module({
  imports: [PrismaModule],
  controllers: [PhotoConsentController],
  providers: [PhotoConsentService],
})
export class PhotoConsentModule {}
