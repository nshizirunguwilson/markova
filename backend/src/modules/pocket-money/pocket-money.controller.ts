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
import { PocketMoneyService } from './pocket-money.service';
import {
  LookupDto,
  MoneyMovementDto,
  PocketMoneyQueryDto,
  ReverseTransactionDto,
  UpdateLimitsDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Pocket money the school holds for its students.
 *
 * The write endpoints belong to the people actually at the counter: the
 * patron, the matron and the office. The read endpoints are wider, because a
 * parent and a student both need to see where the money went, but every read
 * of another student's account is checked rather than assumed.
 */
@ApiTags('Pocket money')
@Controller('pocket-money')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class PocketMoneyController {
  constructor(private readonly service: PocketMoneyService) {}

  @Get('overview')
  @Roles('ADMIN', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Every account, with what the school is holding' })
  overview(@Query() query: PocketMoneyQueryDto) {
    return this.service.overview(query);
  }

  @Post('lookup')
  @Roles('ADMIN', 'PATRON', 'MATRON')
  @ApiOperation({
    summary: 'Find an account from a scanned card or a typed student number',
  })
  lookup(@Body() dto: LookupDto) {
    return this.service.findByIdentifier(dto.identifier);
  }

  @Get('student/:studentId')
  @Roles('ADMIN', 'PATRON', 'MATRON', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: "One student's balance and limits" })
  async account(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.service.assertMayView(user.id, user.role, studentId);
    return this.service.getAccount(studentId);
  }

  @Get('student/:studentId/statement')
  @Roles('ADMIN', 'PATRON', 'MATRON', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: 'Every movement on one account, newest first' })
  async statement(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: PocketMoneyQueryDto,
    @CurrentUser() user: any,
  ) {
    await this.service.assertMayView(user.id, user.role, studentId);
    return this.service.getStatement(studentId, query.page, query.limit);
  }

  @Post('deposit')
  @Roles('ADMIN', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Take money in from a parent' })
  deposit(@Body() dto: MoneyMovementDto, @CurrentUser() user: any) {
    return this.service.deposit(dto.studentId, dto.amount, dto.note, user.id);
  }

  @Post('withdraw')
  @Roles('ADMIN', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Pay money out to a student at the counter' })
  withdraw(@Body() dto: MoneyMovementDto, @CurrentUser() user: any) {
    return this.service.withdraw(dto.studentId, dto.amount, dto.note, user.id);
  }

  @Post('refund')
  @Roles('ADMIN', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Return the remaining balance to the family' })
  refund(@Body() dto: MoneyMovementDto, @CurrentUser() user: any) {
    return this.service.refund(dto.studentId, dto.amount, dto.note, user.id);
  }

  @Post('reverse')
  @Roles('ADMIN', 'PATRON', 'MATRON')
  @ApiOperation({
    summary: 'Undo an entry with a second entry, leaving the original intact',
  })
  reverse(@Body() dto: ReverseTransactionDto, @CurrentUser() user: any) {
    return this.service.reverse(dto.transactionId, dto.reason, user.id);
  }

  // A cap on a child's spending is the parent's call, so a parent may set it
  // on their own child as well as the office.
  @Put('limits')
  @Roles('ADMIN', 'PATRON', 'MATRON', 'PARENT')
  @ApiOperation({ summary: 'Set a daily cap, a low balance warning, or freeze' })
  async limits(@Body() dto: UpdateLimitsDto, @CurrentUser() user: any) {
    await this.service.assertMayView(user.id, user.role, dto.studentId);
    return this.service.updateLimits(dto.studentId, {
      dailyLimit: dto.dailyLimit,
      lowBalanceAlert: dto.lowBalanceAlert,
      isFrozen: dto.isFrozen,
    });
  }
}
