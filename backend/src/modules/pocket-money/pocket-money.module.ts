import { Module } from '@nestjs/common';
import { PocketMoneyService } from './pocket-money.service';
import { PocketMoneyController } from './pocket-money.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PocketMoneyController],
  providers: [PocketMoneyService],
  exports: [PocketMoneyService],
})
export class PocketMoneyModule {}
