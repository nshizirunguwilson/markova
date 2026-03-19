import { IsUUID, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ enum: ['transfer_letter', 'enrollment_confirmation', 'discipline_report', 'transcript'] })
  @IsString()
  type: string;
}

export class GenerateIdCardDto {
  @ApiProperty() @IsUUID() studentId: string;
}

export class BulkIdCardsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
}
