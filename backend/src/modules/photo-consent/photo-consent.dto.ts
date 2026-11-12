import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhotoAnswer } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** The three answers about a student's photo (B6). */
export class PhotoConsentDto {
  @ApiProperty({ enum: PhotoAnswer })
  @IsEnum(PhotoAnswer)
  forId: PhotoAnswer;

  @ApiProperty({ enum: PhotoAnswer })
  @IsEnum(PhotoAnswer)
  inApp: PhotoAnswer;

  @ApiProperty({ enum: PhotoAnswer })
  @IsEnum(PhotoAnswer)
  publicity: PhotoAnswer;

  /** For the office copying a paper form: who signed it. */
  @ApiPropertyOptional({ example: 'Jean Habimana (father)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  answeredBy?: string;
}
