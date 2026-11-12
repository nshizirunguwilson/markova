import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Matches,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpsertConfigDto {
  @ApiProperty({ example: 'school_name' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Markova Academy' })
  @IsString()
  value: string;
}

export class BulkUpsertConfigDto {
  @ApiProperty({ type: [UpsertConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertConfigDto)
  configs: UpsertConfigDto[];
}

export class UpdateOnboardingDto {
  // A step of the ten, or 10 when it is done. Any text was kept and then
  // read back as no step at all.
  @ApiProperty({ example: '3' })
  @IsString()
  @Matches(/^(10|[0-9])$/, {
    message: 'currentStep must be a step from 0 to 10',
  })
  currentStep: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsIn(['true', 'false'])
  completed?: string;
}
