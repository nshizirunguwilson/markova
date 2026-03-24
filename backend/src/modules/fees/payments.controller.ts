import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { PaymentsService, InitiatePaymentDto } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @Roles('PARENT', 'STUDENT')
  @ApiOperation({ summary: 'Initiate a payment for a fee record' })
  async initiatePayment(@Body() dto: InitiatePaymentDto) {
    return this.paymentsService.initiatePayment(dto);
  }

  @Post('callback')
  @ApiOperation({ summary: 'Handle payment provider webhook callback' })
  async handleCallback(@Body() body: any) {
    return this.paymentsService.handleCallback(body);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get payment transaction status' })
  async getPaymentStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }
}
