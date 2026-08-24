import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsUUID,
  IsDateString,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssessmentKind } from '@prisma/client';

export class CreateHomeworkDto {
  @ApiPropertyOptional({ enum: AssessmentKind })
  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxMarks?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateDeductionPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teacherId?: string;
}

export class UpdateHomeworkDto {
  @ApiPropertyOptional({ enum: AssessmentKind })
  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxMarks?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateDeductionPerDay?: number;
}

export class SubmitHomeworkDto {
  @ApiProperty() @IsUUID() homeworkId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileUrl?: string;
}

export class GradeSubmissionDto {
  @ApiProperty() @IsNumber() @Min(0) marks: number;
}

export class QueryHomeworkDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teacherId?: string;

  @ApiPropertyOptional({ enum: AssessmentKind })
  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  // Paging is opt-in: the teacher and student views read this as a plain list,
  // and only the school-wide admin screen has enough rows to need paging.
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
