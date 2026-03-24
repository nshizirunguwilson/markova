import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export class InitiatePaymentDto {
  feeRecordId: string;
  amount: number;
  method: 'MOMO' | 'AIRTEL' | 'CARD';
  phoneNumber?: string; // Required for MOMO/AIRTEL
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async initiatePayment(dto: InitiatePaymentDto) {
    const feeRecord = await this.prisma.feeRecord.findUnique({
      where: { id: dto.feeRecordId },
      include: { student: { include: { user: true } }, term: true },
    });

    if (!feeRecord) throw new NotFoundException('Fee record not found');
    if (feeRecord.status === 'PAID')
      throw new BadRequestException('Fee already fully paid');
    if (dto.amount <= 0)
      throw new BadRequestException('Amount must be positive');
    if (dto.amount > feeRecord.balance)
      throw new BadRequestException('Amount exceeds balance');

    if ((dto.method === 'MOMO' || dto.method === 'AIRTEL') && !dto.phoneNumber) {
      throw new BadRequestException('Phone number is required for mobile money payments');
    }

    // Create a pending payment transaction
    const payment = await this.prisma.paymentTransaction.create({
      data: {
        feeRecordId: dto.feeRecordId,
        amount: dto.amount,
        method: dto.method,
        phoneNumber: dto.phoneNumber,
        status: 'PENDING',
        reference: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      },
    });

    // In production, this is where you'd call the payment provider API:
    // - MOMO: MTN MoMo API / Flutterwave / Paystack
    // - AIRTEL: Airtel Money API / Flutterwave
    // - CARD: Stripe / Flutterwave / Paystack
    //
    // For now, we return the payment reference for the frontend to track.
    // The callback endpoint will handle the provider's webhook.

    this.logger.log(
      `Payment initiated: ${payment.reference} for ${dto.amount} via ${dto.method}`,
    );

    return {
      paymentId: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      // In production, include provider-specific data:
      // checkoutUrl: 'https://...' (for card payments)
      // ussdCode: '*182*...' (for MOMO STK push)
    };
  }

  async handleCallback(body: any) {
    // This endpoint receives webhooks from payment providers
    // Validate the webhook signature, then update the payment status
    const reference =
      body.reference || body.tx_ref || body.transactionRef;
    if (!reference) throw new BadRequestException('Missing payment reference');

    const payment = await this.prisma.paymentTransaction.findFirst({
      where: { reference },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    const success =
      body.status === 'successful' ||
      body.status === 'success' ||
      body.Status === 'Successful';

    await this.prisma.$transaction(async (tx) => {
      // Update the payment transaction
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: success ? 'SUCCESS' : 'FAILED',
          providerReference:
            body.providerReference || body.flw_ref || body.transaction_id,
          completedAt: success ? new Date() : null,
        },
      });

      if (success) {
        // Update the fee record
        const feeRecord = await tx.feeRecord.findUnique({
          where: { id: payment.feeRecordId },
        });
        if (feeRecord) {
          const newAmountPaid = feeRecord.amountPaid + payment.amount;
          const newBalance = feeRecord.amountDue - newAmountPaid;
          await tx.feeRecord.update({
            where: { id: feeRecord.id },
            data: {
              amountPaid: newAmountPaid,
              balance: Math.max(0, newBalance),
              status: newBalance <= 0 ? 'PAID' : 'PARTIAL',
              paymentMethod: payment.method as any,
              paymentDate: new Date(),
            },
          });
        }
      }
    });

    return { received: true };
  }

  async getPaymentStatus(id: string) {
    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { id },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return {
      id: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      completedAt: payment.completedAt,
    };
  }
}
