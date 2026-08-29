import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdmissionsService } from './admissions.service';
import {
  AddNoteDto,
  AdmissionQueryDto,
  DecideDto,
  MakeOfferDto,
  RequestInfoDto,
  RevokeOfferDto,
  SaveIntakeDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * The admissions desk.
 *
 * The office only: an application holds a child's medical conditions, their
 * address and their parents' identity documents before the school has any
 * relationship with the family at all. A teacher has no business in it, and
 * neither does anybody else on the roll.
 *
 * Every route here is `ADMIN`. The service takes the acting user's id on each
 * write rather than reading a role, so adding a REGISTRAR later is a change to
 * this decorator and nothing else.
 */
@ApiTags('Admissions')
@Controller('admissions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AdmissionsController {
  constructor(private readonly service: AdmissionsService) {}

  // ── Intakes ─────────────────────────────────────────────────────────────

  @Get('intakes')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Every round, with how many places are left' })
  intakes() {
    return this.service.intakes();
  }

  @Put('intakes')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Open a round, change its places, or close it' })
  saveIntake(@Body() dto: SaveIntakeDto) {
    return this.service.saveIntake(dto);
  }

  // ── The queue ───────────────────────────────────────────────────────────

  @Get('applications')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'The queue, oldest waiting first' })
  queue(@Query() query: AdmissionQueryDto) {
    return this.service.queue(query);
  }

  @Get('applications/:id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'One application, with its trail and any duplicates',
  })
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.one(id);
  }

  // ── Deciding ────────────────────────────────────────────────────────────

  @Post('applications/:id/decide')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Move an application along, with a reason' })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideDto,
    @CurrentUser() user: any,
  ) {
    return this.service.decide(id, dto, user.id);
  }

  @Post('applications/:id/request-info')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Ask the family for exactly what is missing' })
  requestInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestInfoDto,
    @CurrentUser() user: any,
  ) {
    return this.service.requestInfo(id, dto, user.id);
  }

  // ── Offers ──────────────────────────────────────────────────────────────

  @Post('applications/:id/offer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Hold a place for a family, with an expiry' })
  offer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MakeOfferDto,
    @CurrentUser() user: any,
  ) {
    return this.service.makeOffer(id, dto, user.id);
  }

  @Post('offers/revoke')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Take a held place back; the application returns to the pile',
  })
  revokeOffer(@Body() dto: RevokeOfferDto, @CurrentUser() user: any) {
    return this.service.revokeOffer(dto.offerId, dto.reason, user.id);
  }

  @Post('offers/expire')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Release places held by offers nobody answered' })
  expireOffers() {
    return this.service.expireOffers();
  }

  // ── Enrolment ───────────────────────────────────────────────────────────

  @Post('applications/:id/enrol')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Turn an accepted application into a student' })
  enrol(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.enrol(id, user.id);
  }

  // ── Documents and notes ─────────────────────────────────────────────────

  @Post('documents/:id/verify')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Record that the office has checked a document' })
  verifyDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.verifyDocument(id, user.id);
  }

  @Post('applications/:id/notes')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'An internal remark, never shown to the family' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addNote(id, dto.body, user.id);
  }
}
