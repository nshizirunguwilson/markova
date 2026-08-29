import {
  Body,
  Controller,
  Delete,
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
import { FinanceService } from './finance.service';
import {
  CopyFeeStructureDto,
  FeeItemDto,
  FeeRegisterQueryDto,
  GrantWaiverDto,
  RaiseInvoicesDto,
  RecordPaymentDto,
  RevokeWaiverDto,
  VoidPaymentDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * School fees.
 *
 * Two audiences, and the split runs through every route here. The office —
 * the bursar and the head — set prices, raise bills and take money. A family
 * sees one account, its own, and cannot see the roll or anybody else's
 * balance.
 *
 * A teacher is on neither list. Whether a family has paid is not a teacher's
 * business, and the staffroom is exactly where that becomes a child's problem.
 */
@ApiTags('Finance')
@Controller('finance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  // ── The price list ──────────────────────────────────────────────────────

  @Get('structure')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: "A term's fee lines, by class level" })
  structure(@Query('termId', ParseUUIDPipe) termId: string) {
    return this.service.feeStructure(termId);
  }

  @Put('structure/item')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Add or change one fee line' })
  saveItem(@Body() dto: FeeItemDto) {
    return this.service.saveFeeItem(dto);
  }

  @Delete('structure/item/:id')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Remove a fee line; invoices already raised stand' })
  deleteItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteFeeItem(id);
  }

  @Post('structure/copy')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: "Copy one term's price list onto another" })
  copyStructure(@Body() dto: CopyFeeStructureDto) {
    return this.service.copyFeeStructure(dto.fromTermId, dto.toTermId);
  }

  // ── Raising the bills ───────────────────────────────────────────────────

  @Post('invoices/raise')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: "Raise the term's invoices for everyone not billed" })
  raise(@Body() dto: RaiseInvoicesDto) {
    return this.service.raiseInvoices(dto.termId, dto.classSectionId);
  }

  // ── The office's screens ────────────────────────────────────────────────

  @Get('register')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: "Every student's standing for a term" })
  register(@Query() query: FeeRegisterQueryDto) {
    return this.service.register(query);
  }

  @Get('summary')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Billed, collected, waived and outstanding' })
  summary(@Query('termId', ParseUUIDPipe) termId: string) {
    return this.service.summary(termId);
  }

  // ── One account ─────────────────────────────────────────────────────────

  @Get('account/:studentId')
  @Roles('ADMIN', 'BURSAR', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: "One student's term: bill, receipts and waivers" })
  async account(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId', ParseUUIDPipe) termId: string,
    @CurrentUser() user: any,
  ) {
    await this.service.assertMayViewAccount(user.id, user.role, studentId);
    return this.service.account(studentId, termId);
  }

  @Get('history/:studentId')
  @Roles('ADMIN', 'BURSAR', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: 'Every term a student has been billed for' })
  async history(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.service.assertMayViewAccount(user.id, user.role, studentId);
    return this.service.history(studentId);
  }

  // ── Money in ────────────────────────────────────────────────────────────

  @Post('payments')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Take a payment and issue its receipt' })
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentUser() user: any) {
    return this.service.recordPayment(dto, user.id);
  }

  @Post('payments/void')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Void a receipt; it stays in the book' })
  voidPayment(@Body() dto: VoidPaymentDto, @CurrentUser() user: any) {
    return this.service.voidPayment(dto.paymentId, dto.reason, user.id);
  }

  // ── Amounts not being collected ─────────────────────────────────────────

  @Post('waivers')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Write off part of a bill, with a reason' })
  grantWaiver(@Body() dto: GrantWaiverDto, @CurrentUser() user: any) {
    return this.service.grantWaiver(dto, user.id);
  }

  @Post('waivers/revoke')
  @Roles('ADMIN', 'BURSAR')
  @ApiOperation({ summary: 'Withdraw a waiver; it stays in the book' })
  revokeWaiver(@Body() dto: RevokeWaiverDto, @CurrentUser() user: any) {
    return this.service.revokeWaiver(dto.waiverId, dto.reason, user.id);
  }
}
