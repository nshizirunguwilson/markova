import { IsString, IsOptional, IsNumber, Min, IsUUID, IsBoolean, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() author: string;
  @ApiPropertyOptional() @IsOptional() @IsString() isbn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) replacementCost?: number;
}

export class UpdateBookDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() author?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() isbn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) replacementCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BulkImportBooksDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBookDto)
  books: CreateBookDto[];
}

export class CheckoutDto {
  @ApiProperty() @IsString() bookIdentifier: string; // barcode or book ID
  @ApiProperty() @IsString() studentIdentifier: string; // student ID number or user ID
}

export class ReturnDto {
  @ApiProperty() @IsString() bookIdentifier: string; // barcode or book ID
}

export class ReportLostDto {
  @ApiProperty() @IsUUID() loanId: string;
}

export class QueryBooksDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() available?: boolean;
}
