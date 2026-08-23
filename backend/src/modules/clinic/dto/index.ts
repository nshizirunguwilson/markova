import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicSeverity, ClinicVisitOutcome } from '@prisma/client';

export class CreateVisitDto {
  @ApiProperty() @IsUUID() studentId: string;

  /** What the student said was wrong, in their words. */
  @ApiProperty() @IsString() @MaxLength(500) complaint: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) findings?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) treatment?: string;

  @ApiPropertyOptional({ enum: ClinicSeverity })
  @IsOptional()
  @IsEnum(ClinicSeverity)
  severity?: ClinicSeverity;

  @ApiPropertyOptional({ enum: ClinicVisitOutcome })
  @IsOptional()
  @IsEnum(ClinicVisitOutcome)
  outcome?: ClinicVisitOutcome;

  // A plausible human range. 25 is a corpse and 45 is not survivable, so a
  // value outside this is a typo, and a typo in a temperature is dangerous.
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temperature?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) referredTo?: string;
}

export class UpdateVisitDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) findings?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) treatment?: string;

  @ApiPropertyOptional({ enum: ClinicSeverity })
  @IsOptional()
  @IsEnum(ClinicSeverity)
  severity?: ClinicSeverity;

  @ApiPropertyOptional({ enum: ClinicVisitOutcome })
  @IsOptional()
  @IsEnum(ClinicVisitOutcome)
  outcome?: ClinicVisitOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temperature?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) referredTo?: string;
}

export class GiveMedicineDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() visitId?: string;
  @ApiProperty() @IsString() @MaxLength(200) medicine: string;
  @ApiProperty() @IsString() @MaxLength(100) dose: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class HealthRecordDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) chronicConditions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) regularMedication?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) allergyNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) emergencyPlan?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) emergencyContactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) emergencyRelationship?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) insuranceProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) insuranceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) preferredClinic?: string;
}

export class VisitQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;

  @ApiPropertyOptional({ enum: ClinicSeverity })
  @IsOptional()
  @IsEnum(ClinicSeverity)
  severity?: ClinicSeverity;

  @ApiPropertyOptional({ enum: ClinicVisitOutcome })
  @IsOptional()
  @IsEnum(ClinicVisitOutcome)
  outcome?: ClinicVisitOutcome;

  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;

  /** The sick bay list: everyone kept in and not yet discharged. */
  @ApiPropertyOptional() @IsOptional() @IsString() inSickBay?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
