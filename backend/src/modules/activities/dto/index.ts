import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityAudience, ActivityKind, ConsentState } from '@prisma/client';

export class CreateActivityDto {
  @ApiProperty({ enum: ActivityKind }) @IsEnum(ActivityKind) kind: ActivityKind;
  @ApiProperty() @IsString() @MaxLength(200) title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiProperty() @IsDateString() startsAt: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;

  @ApiPropertyOptional({ enum: ActivityAudience })
  @IsOptional()
  @IsEnum(ActivityAudience)
  audience?: ActivityAudience;

  /** A trip off the premises needs it; an assembly does not. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresConsent?: boolean;

  /** A club meeting takes a register; an assembly does not. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() tracksAttendance?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() termId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  classLevelIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  classSectionIds?: string[];
}

export class UpdateActivityDto {
  @ApiPropertyOptional({ enum: ActivityKind })
  @IsOptional()
  @IsEnum(ActivityKind)
  kind?: ActivityKind;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresConsent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() tracksAttendance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class CancelActivityDto {
  /** Required: families who already consented need to know why it is off. */
  @ApiProperty() @IsString() @MaxLength(300) reason: string;
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ enum: ActivityKind })
  @IsOptional()
  @IsEnum(ActivityKind)
  kind?: ActivityKind;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeCancelled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ParticipantDto {
  @ApiProperty() @IsUUID() studentId: string;
}

export class AddClassDto {
  @ApiProperty() @IsUUID() classSectionId: string;
}

export class ConsentDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty({ enum: ConsentState })
  @IsEnum(ConsentState)
  consent: ConsentState;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class AttendanceRecordDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsBoolean() attended: boolean;
}

export class ActivityAttendanceDto {
  @ApiProperty({ type: [AttendanceRecordDto] })
  @IsArray()
  records: AttendanceRecordDto[];
}
