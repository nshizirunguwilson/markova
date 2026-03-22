import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsDateString,
  IsArray,
  IsEnum,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── ACADEMIC YEAR ────────────────────────────────────────────────────────────

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2025-2026' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '2025-02-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-11-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateAcademicYearDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

// ─── TERM ─────────────────────────────────────────────────────────────────────

export class CreateTermDto {
  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiProperty({ example: 'Term 1' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '2025-02-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-04-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateTermDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

// ─── CLASS LEVEL ──────────────────────────────────────────────────────────────

export class CreateClassLevelDto {
  @ApiProperty({ example: 'Senior 1' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  order: number;
}

export class UpdateClassLevelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

// ─── CLASS SECTION ────────────────────────────────────────────────────────────

export class CreateClassSectionDto {
  @ApiProperty()
  @IsUUID()
  classLevelId: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  @MaxLength(255)
  name: string;
}

export class UpdateClassSectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classLevelId?: string;
}

// ─── SUBJECT ──────────────────────────────────────────────────────────────────

export class CreateSubjectDto {
  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Sciences' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  maxMarks?: number;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxMarks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── ASSESSMENT TYPE ──────────────────────────────────────────────────────────

export class CreateAssessmentTypeDto {
  @ApiProperty({ example: 'Midterm Exam' })
  @IsString()
  @MaxLength(255)
  name: string;
}

// ─── TEACHER-SUBJECT-CLASS ASSIGNMENT ─────────────────────────────────────────

export class CreateAssignmentDto {
  @ApiProperty()
  @IsUUID()
  teacherId: string;

  @ApiProperty()
  @IsUUID()
  subjectId: string;

  @ApiProperty()
  @IsUUID()
  classSectionId: string;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;
}

export class BulkAssignmentDto {
  @ApiProperty({ type: [CreateAssignmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAssignmentDto)
  assignments: CreateAssignmentDto[];
}

// ─── PROMOTION ────────────────────────────────────────────────────────────────

export class PromoteStudentsDto {
  @ApiProperty({ description: 'Source class section ID' })
  @IsUUID()
  fromClassSectionId: string;

  @ApiProperty({ description: 'Target class section ID' })
  @IsUUID()
  toClassSectionId: string;

  @ApiProperty({ description: 'Academic year ID to check results' })
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({ description: 'Pass threshold (default 50)', example: 50 })
  @IsOptional()
  @IsInt()
  passThreshold?: number;
}
