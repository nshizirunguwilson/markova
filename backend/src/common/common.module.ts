import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './ownership.service';
import { FeeGateService } from './fee-gate.service';

@Global()
@Module({
  providers: [OwnershipService, FeeGateService],
  exports: [OwnershipService, FeeGateService],
})
export class CommonModule {}
