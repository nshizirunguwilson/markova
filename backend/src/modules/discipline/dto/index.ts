import { IsUUID, IsString, IsNumber, Min, IsEnum, IsOptional, IsDateString, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DisciplineAction {
  VERBAL_WARNING = 'VERBAL_WARNING',
  WRITTEN_WARNING = 'WRITTEN_WARNING',
  DETENTION = 'DETENTION',
  SUSPENSION = 'SUSPENSION',
  EXPULSION = 'EXPULSION',
}

export enum AppealStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class CreateIncidentDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) location?: string;
  @ApiProperty() @IsString() @MaxLength(5000) description: string;
  @ApiProperty() @IsNumber() @Min(0) pointsDeducted: number;
  @ApiProperty({ enum: DisciplineAction })
  @IsEnum(DisciplineAction)
  actionTaken: DisciplineAction;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) pointsDeducted?: number;
  @ApiPropertyOptional({ enum: DisciplineAction }) @IsOptional() @IsEnum(DisciplineAction) actionTaken?: DisciplineAction;
}

export class CreateAppealDto {
  @ApiProperty() @IsUUID() incidentId: string;
  @ApiProperty() @IsString() @MaxLength(5000) statement: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) evidenceUrls?: string[];
}

export class ReviewAppealDto {
  @ApiProperty({ enum: AppealStatus }) @IsEnum(AppealStatus) status: AppealStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reviewNotes?: string;
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
