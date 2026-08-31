import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MoneyMovementDto {
  /**
   * A key the client makes once and resends on every retry.
   *
   * This is money at a counter with a queue behind it. A request that times
   * out and is retried, without this, is a second entry for money that was
   * handed over once.
   */
  @ApiPropertyOptional({
    description: 'Resend the same key to retry without repeating the entry',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiProperty() @IsUUID() studentId: string;

  /**
   * Rwandan francs. Positive always: the endpoint decides the direction, so a
   * negative deposit can never be mistaken for a refund.
   */
  @ApiProperty({ example: 5000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Visiting day, handed in by mother' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ReverseTransactionDto {
  @ApiProperty() @IsUUID() transactionId: string;

  /** Required: an unexplained reversal is indistinguishable from a mistake. */
  @ApiProperty({ example: 'Entered twice at the counter' })
  @IsString()
  @MaxLength(200)
  reason: string;
}

export class UpdateLimitsDto {
  @ApiProperty() @IsUUID() studentId: string;

  @ApiPropertyOptional({ example: 2000, description: 'Null removes the cap' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyLimit?: number | null;

  @ApiPropertyOptional({ example: 1000, description: 'Null never warns' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lowBalanceAlert?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFrozen?: boolean;
}

export class LookupDto {
  /** A student number, or the code on their ID card. */
  @ApiProperty({ example: 'STD-2025-231419-167' })
  @IsString()
  @MaxLength(64)
  identifier: string;
}

export class PocketMoneyQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
