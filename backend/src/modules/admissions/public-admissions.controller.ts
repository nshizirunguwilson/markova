import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdmissionsService } from './admissions.service';
import { PublicSchoolService } from '../../prisma/public-school.service';
import { withSchool } from '../../prisma/request-context';
import { AnswerOfferDto, StatusLookupDto, SubmitApplicationDto } from './dto';

/**
 * What the admissions site and a family can reach without an account.
 *
 * The second set of unguarded routes in the system, after the branding the
 * login page needs. Three things keep them safe:
 *
 *   **Throttled hard.** A form anybody on the internet can post to is a form
 *   anybody on the internet can post to four thousand times. The app-wide
 *   limit is 100 a minute; these are far tighter.
 *
 *   **Proved by something only the family knows.** Looking up an application
 *   needs its reference *and* the applicant's date of birth, and a wrong
 *   reference and a wrong date give the same answer - otherwise a reference
 *   number alone would let somebody confirm a child's birthday by guessing.
 *
 *   **Thin replies.** The status route returns where the application stands
 *   and what is still wanted. No internal notes, no reviewer names, and
 *   nothing at all about anybody else.
 */
@ApiTags('Admissions (public)')
@Controller('admissions/public')
export class PublicAdmissionsController {
  constructor(
    private readonly service: AdmissionsService,
    private readonly publicSchool: PublicSchoolService,
  ) {}

  /** Everything here belongs to the school whose admissions page this is. */
  private async inSchool<T>(req: Request, fn: () => Promise<T>): Promise<T> {
    const schoolId = await this.publicSchool.resolve(req);
    return withSchool(schoolId, fn);
  }

  @Get('intakes')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'The rounds a family may apply to right now' })
  intakes(@Req() req: Request) {
    return this.inSchool(req, () => this.service.openIntakes());
  }

  /**
   * A family applies.
   *
   * Five a minute from one address. A school takes a few hundred applications
   * in a fortnight, so nobody legitimate is near this, and it is low enough
   * that filling the register with rubbish takes real effort.
   */
  @Post('applications')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Submit an application from the admissions site' })
  submit(@Body() dto: SubmitApplicationDto, @Req() req: Request) {
    return this.inSchool(req, () => this.service.submit(dto));
  }

  @Post('status')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({
    summary: 'Where an application stands, by reference and date of birth',
  })
  status(@Body() dto: StatusLookupDto, @Req() req: Request) {
    return this.inSchool(req, () =>
      this.service.publicStatus(dto.reference, dto.dateOfBirth),
    );
  }

  @Post('offer/answer')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'A family accepts or declines the place they were offered',
  })
  answer(@Body() dto: AnswerOfferDto, @Req() req: Request) {
    return this.inSchool(req, () =>
      this.service.respondToOffer(
        dto.reference,
        dto.dateOfBirth,
        dto.accept,
        dto.reason,
      ),
    );
  }
}
