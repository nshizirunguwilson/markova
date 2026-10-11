import { SupportArrangement, SupportNeed } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** A student's support plan, as the Director of Studies or the nurse keeps it. */
export class SupportPlanDto {
  @ApiPropertyOptional({ enum: SupportNeed, isArray: true })
  @IsArray()
  @ArrayMaxSize(7)
  @IsEnum(SupportNeed, { each: true })
  needs: SupportNeed[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  needNote?: string;

  @ApiPropertyOptional({ enum: SupportArrangement, isArray: true })
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(SupportArrangement, { each: true })
  arrangements: SupportArrangement[];

  /** With extra time: how much, as a share of the exam's time. */
  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(200)
  extraTimePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  otherArrangement?: string;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  reviewOn?: string;

  @ApiPropertyOptional({ example: 'The family and the district SNE officer' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  agreedWith?: string;
}
