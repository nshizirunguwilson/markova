import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeAppliesTo, PaymentMethod, WaiverKind } from '@prisma/client';

/** One line of a class's price list, for a term. */
export class FeeItemDto {
  @ApiPropertyOptional({ description: 'Omitted for a new line' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsUUID() classLevelId: string;

  @ApiProperty({ example: 'Tuition' })
  @IsString()
  @MaxLength(80)
  name: string;

  /** Rwandan francs. Zero is allowed: a line can be free for a year. */
  @ApiProperty({ example: 85000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ enum: FeeAppliesTo, default: FeeAppliesTo.ALL })
  @IsOptional()
  @IsEnum(FeeAppliesTo)
  appliesTo?: FeeAppliesTo;

  @ApiPropertyOptional({ description: 'Where the line sits on the invoice' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

/** Copy a term's whole price list onto another term. */
export class CopyFeeStructureDto {
  @ApiProperty() @IsUUID() fromTermId: string;
  @ApiProperty() @IsUUID() toTermId: string;
}

/**
 * Raise the term's invoices.
 *
 * Narrowed to one class when the office is billing a year group at a time.
 */
export class RaiseInvoicesDto {
  @ApiProperty() @IsUUID() termId: string;

  @ApiPropertyOptional({ description: 'One class only, rather than the school' })
  @IsOptional()
  @IsUUID()
  classSectionId?: string;
}

export class RecordPaymentDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() termId: string;

  /** Rwandan francs, always positive: the entry is money in. */
  @ApiProperty({ example: 75000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** The bank slip number, the MoMo transaction id, the cheque number. */
  @ApiPropertyOptional({ example: 'MP260212.4471.A18823' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  /**
   * When the money changed hands, which is not always when it was typed in.
   * Defaults to now.
   */
  @ApiPropertyOptional({ example: '2026-02-12' })
  @IsOptional()
  @IsString()
  paidAt?: string;

  @ApiPropertyOptional({ example: 'Paid at the office by the mother' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class VoidPaymentDto {
  @ApiProperty() @IsUUID() paymentId: string;

  /** Required: an unexplained void is indistinguishable from a mistake. */
  @ApiProperty({ example: 'Entered twice at the counter' })
  @IsString()
  @MaxLength(200)
  reason: string;
}

export class GrantWaiverDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() termId: string;

  @ApiProperty({ enum: WaiverKind })
  @IsEnum(WaiverKind)
  kind: WaiverKind;

  /** Rwandan francs off the bill. A full bursary is the invoice total. */
  @ApiProperty({ example: 195000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'District bursary, confirmed by the sector office' })
  @IsString()
  @MaxLength(200)
  reason: string;
}

export class RevokeWaiverDto {
  @ApiProperty() @IsUUID() waiverId: string;

  @ApiProperty({ example: 'Sponsor withdrew before the term started' })
  @IsString()
  @MaxLength(200)
  reason: string;
}

/** Which students to show, and where in the list to look. */
export class FeeRegisterQueryDto {
  @ApiProperty() @IsUUID() termId: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;

  @ApiPropertyOptional({
    description: 'CLEARED, PART_PAID, UNPAID or NOT_INVOICED',
  })
  @IsOptional()
  @IsString()
  status?: string;

  /** A name or a student number. */
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
  @Max(200)
  limit?: number;
}

/** Several lines saved together, which is how the structure screen writes. */
export class SaveFeeStructureDto {
  @ApiProperty({ type: [FeeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeItemDto)
  items: FeeItemDto[];
}
