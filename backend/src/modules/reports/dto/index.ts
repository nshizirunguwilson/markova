import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DocumentType {
  TRANSFER_LETTER = 'transfer_letter',
  ENROLLMENT_CONFIRMATION = 'enrollment_confirmation',
  DISCIPLINE_REPORT = 'discipline_report',
  TRANSCRIPT = 'transcript',
}

export class GenerateReportCardDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() termId: string;
}

export class GenerateClassReportCardsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
}

export class GenerateYearReportDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() academicYearId: string;
}

export class GenerateDocumentDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;
}

export class GenerateIdCardDto {
  @ApiProperty() @IsUUID() studentId: string;
}

export class BulkIdCardsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
}

export class IssueIdCardDto {
  @ApiProperty() @IsUUID() studentId: string;
}

export enum IdCardStatusFilter {
  ALL = 'all',
  ISSUED = 'issued',
  NOT_ISSUED = 'not_issued',
  SUSPENDED = 'suspended',
}

export class IdCardRegistryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: IdCardStatusFilter })
  @IsOptional()
  @IsEnum(IdCardStatusFilter)
  status?: IdCardStatusFilter;

  // The roll runs to hundreds of students, so the registry is paged rather
  // than loaded whole.
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
