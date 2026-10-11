import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';

/** The ways of leaving the roll that are a decision, not an event. */
export const LEAVING: StudentStatus[] = [
  StudentStatus.WITHDRAWN,
  StudentStatus.EXPELLED,
  StudentStatus.TRANSFERRED,
  StudentStatus.GRADUATED,
];

export class PauseDto {
  @ApiProperty({ example: '2026-10-13' })
  @IsDateString()
  startsOn: string;

  /** The last day out. Required for a suspension. */
  @ApiPropertyOptional({ example: '2026-10-20' })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @ApiProperty({ example: 'Fighting in the dormitory' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** The discipline record a suspension was decided on. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  disciplineIncidentId?: string;
}

export class BackDto {
  /** The first day back. Today when left out. */
  @ApiPropertyOptional({ example: '2026-10-21' })
  @IsOptional()
  @IsDateString()
  on?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class LeaveDto {
  @ApiProperty({ enum: LEAVING })
  @IsIn(LEAVING)
  status: StudentStatus;

  @ApiProperty({ example: '2026-10-12' })
  @IsDateString()
  on: string;

  @ApiProperty({ example: 'Family moved to Rubavu' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class PassedAwayDto {
  @ApiProperty({ example: '2026-10-12' })
  @IsDateString()
  on: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ReadmitDto {
  @ApiProperty({ example: '2027-01-11' })
  @IsDateString()
  on: string;

  /** The class they come back to: the same one, or the year to repeat. */
  @ApiProperty()
  @IsUUID()
  classSectionId: string;

  @ApiProperty({ example: 'Back after her baby was born' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
