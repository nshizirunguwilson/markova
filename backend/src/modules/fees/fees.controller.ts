import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeesService } from './fees.service';
import { OwnershipService } from '../../common/ownership.service';
import { RecordPaymentDto, UpdatePaymentDto, QueryFeesDto } from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Fees')
@Controller('fees')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class FeesController {
  constructor(
    private readonly service: FeesService,
    private readonly ownership: OwnershipService,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Record a fee payment' })
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a fee payment' })
  updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.service.updatePayment(id, dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Query fee records' })
  findAll(@Query() query: QueryFeesDto) {
    return this.service.findAll(query);
  }

  @Get('summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get fee collection summary' })
  getSummary(
    @Query('academicYearId') academicYearId?: string,
    @Query('termId') termId?: string,
  ) {
    return this.service.getSummary(academicYearId, termId);
  }

  @Get('student/:studentId')
  @Roles('ADMIN', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get student fee records' })
  async getStudentFees(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getStudentFees(studentId);
  }

  @Get(':id/receipt')
  @Roles('ADMIN', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Generate payment receipt HTML' })
  getReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.generateReceiptHtml(id);
  }

  @Get(':id/receipt/pdf')
  @Roles('ADMIN', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Download payment receipt as PDF' })
  async getReceiptPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateReceiptPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=receipt-${id}.pdf`,
    });
    res.send(buffer);
  }
}
