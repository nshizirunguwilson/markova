import {
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMarkDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsUUID() assessmentTypeId: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) score: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxScore?: number;
}

export class UpdateMarkDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(100) score: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxScore?: number;
}

export class BatchMarkEntryDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsUUID() assessmentTypeId: string;
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchMarkItem)
  marks: BatchMarkItem[];
}

export class BatchMarkItem {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) score: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxScore?: number;
}

export class CalculateTermResultDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
}

export class CalculateYearResultDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() academicYearId: string;
}

export class UpdateTermResultCommentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  teacherComment?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  headmasterComment?: string;
}

export class PublishTermResultsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsBoolean() isPublished: boolean;
}

export class QueryMarksDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() termId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assessmentTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
