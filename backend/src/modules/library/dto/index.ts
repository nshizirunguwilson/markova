import { IsString, IsOptional, IsNumber, Min, Max, IsUUID, IsBoolean, IsArray, ValidateNested, IsInt, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiProperty() @IsString() @MaxLength(255) author: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) isbn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) category?: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) replacementCost?: number;
}

export class UpdateBookDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) author?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) isbn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) barcode?: string;
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

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
