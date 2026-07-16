import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

// Public by design: anyone holding a printed report card can check it against
// the digital original. No auth; a tighter throttle guards against code
// fishing (12 random digits keep the space unguessable anyway).
@ApiTags('Verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly service: ReportsService) {}

  @Get(':code')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Look up the digital report behind a printed code' })
  verify(@Param('code') code: string) {
    return this.service.verifyReportByCode(code);
  }
}
