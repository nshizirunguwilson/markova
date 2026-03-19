import { IsUUID, IsString, IsNumber, Min, IsEnum, IsOptional, IsDateString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIncidentDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) pointsDeducted: number;
  @ApiProperty({ enum: ['VERBAL_WARNING', 'WRITTEN_WARNING', 'DETENTION', 'SUSPENSION', 'EXPULSION'] })
  @IsString()
  actionTaken: string;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) pointsDeducted?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() actionTaken?: string;
}

export class CreateAppealDto {
  @ApiProperty() @IsUUID() incidentId: string;
  @ApiProperty() @IsString() statement: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) evidenceUrls?: string[];
}

export class ReviewAppealDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNotes?: string;
}

export class AcknowledgeIncidentDto {
  @ApiProperty() @IsUUID() incidentId: string;
}

export class QueryIncidentsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
