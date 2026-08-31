import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsIn,
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

/**
 * Asking for a PDF to be rendered in the background.
 *
 * One DTO for the three kinds, because they differ only in which id they need
 * and a separate route each would be three copies of the same ownership check.
 * The optional fields are required per kind, which the service asserts.
 */
export class QueueRenderDto {
  @ApiProperty({
    enum: ['term-report', 'year-report', 'document'],
    description: 'What to render',
  })
  @IsIn(['term-report', 'year-report', 'document'])
  kind!: 'term-report' | 'year-report' | 'document';

  @ApiProperty()
  @IsUUID()
  studentId!: string;

  @ApiPropertyOptional({ description: 'Required for a term report' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiPropertyOptional({ description: 'Required for a year report' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @ApiPropertyOptional({ description: 'Required for a document' })
  @IsOptional()
  @IsString()
  type?: string;
}
