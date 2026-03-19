import { IsUUID, IsNumber, Min, IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordPaymentDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsNumber() @Min(0) amountDue: number;
  @ApiProperty() @IsNumber() @Min(0) amountPaid: number;
  @ApiProperty({ enum: ['MOMO', 'AIRTEL', 'CARD', 'CASH', 'BANK'] }) @IsString() paymentMethod: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paymentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amountPaid?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class QueryFeesDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() academicYearId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
