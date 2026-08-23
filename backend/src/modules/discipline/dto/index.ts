import {
  IsUUID,
  IsString,
  IsNumber,
  Min,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  IsInt,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeritCategory } from '@prisma/client';

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
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  time?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
  @ApiProperty() @IsString() @MaxLength(5000) description: string;
  @ApiProperty() @IsNumber() @Min(0) pointsDeducted: number;
  @ApiProperty({ enum: DisciplineAction })
  @IsEnum(DisciplineAction)
  actionTaken: DisciplineAction;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  pointsDeducted?: number;
  @ApiPropertyOptional({ enum: DisciplineAction })
  @IsOptional()
  @IsEnum(DisciplineAction)
  actionTaken?: DisciplineAction;
}

export class CreateAppealDto {
  @ApiProperty() @IsUUID() incidentId: string;
  @ApiProperty() @IsString() @MaxLength(5000) statement: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ReviewAppealDto {
  @ApiProperty({ enum: AppealStatus })
  @IsEnum(AppealStatus)
  status: AppealStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNotes?: string;
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

// ─── MERITS ─────────────────────────────────────────────────────────────────

export class AwardMeritDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() termId: string;

  @ApiProperty({ enum: MeritCategory })
  @IsEnum(MeritCategory)
  category: MeritCategory;

  @ApiProperty() @IsString() @MaxLength(500) description: string;

  // A merit worth 30 points would undo three serious incidents at once, which
  // is how a recognition system stops being taken seriously.
  @ApiProperty() @IsInt() @Min(1) @Max(20) points: number;

  @ApiProperty() @IsDateString() date: string;
}

export class QueryMeritsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;

  @ApiPropertyOptional({ enum: MeritCategory })
  @IsOptional()
  @IsEnum(MeritCategory)
  category?: MeritCategory;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
