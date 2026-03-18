import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
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
  @ApiProperty({ example: '3' })
  @IsString()
  currentStep: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsString()
  completed?: string;
}
