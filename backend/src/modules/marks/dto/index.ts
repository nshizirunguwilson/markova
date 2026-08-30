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
import { MaxWords } from '../../../common/validators/max-words.validator';
import { MAX_COMMENT_WORDS } from '../../../common/report-comments';

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
  /*
    Twenty words, counted as words rather than characters. The box on a
    printed card is two inches tall, and what has to fit it is a sentence
    somebody wrote rather than a length of text. The drafts are built to the
    same limit, so a typed comment and a suggested one are held to one rule.
  */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxWords(MAX_COMMENT_WORDS)
  @MaxLength(1000)
  teacherComment?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxWords(MAX_COMMENT_WORDS)
  @MaxLength(1000)
  headmasterComment?: string;
}

export class PublishTermResultsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsBoolean() isPublished: boolean;
}

/**
 * Issuing the report card is its own act, separate from releasing the marks:
 * a school lets marks out as soon as they are checked and issues the document
 * later, after deliberation and once the comments are written.
 */
export class PublishReportCardsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsBoolean() isPublished: boolean;
}

/**
 * The head teacher standing behind a class's cards, or handing them back.
 *
 * Handing them back takes a reason: a class teacher who is told only that
 * their cards were returned has to guess what to fix, and guessing is how a
 * card goes round the loop three times.
 */
export class ConfirmReportCardsDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsUUID() termId: string;
  @ApiProperty() @IsBoolean() isConfirmed: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
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
