import { IsString, IsOptional, IsNumber, Min, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHomeworkDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxMarks?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) lateDeductionPerDay?: number;
}

export class UpdateHomeworkDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxMarks?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) lateDeductionPerDay?: number;
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
}
