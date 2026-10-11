import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** What an adult student's parents may see. Leave a switch out to keep it. */
export class SharingDto {
  /** Marks and report cards. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  results?: boolean;

  /** Attendance and discipline. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  conduct?: boolean;

  /** Visits to the sick bay. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  health?: boolean;
}
