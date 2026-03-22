import { IsUUID, IsEnum, IsOptional, IsString, IsDateString, IsArray, ValidateNested, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AttendanceType {
  DAILY = 'daily',
  SUBJECT = 'subject',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
}

export class MarkAttendanceDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: AttendanceType }) @IsEnum(AttendanceType) type: AttendanceType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiProperty({ enum: AttendanceStatus }) @IsEnum(AttendanceStatus) status: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) reasonCategory?: string;
}

export class QrScanDto {
  @ApiProperty({ description: 'Student ID number or QR code data' }) @IsString() @MaxLength(255) qrData: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ enum: AttendanceType }) @IsOptional() @IsEnum(AttendanceType) type?: AttendanceType;
}

export class BulkAttendanceDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: AttendanceType }) @IsEnum(AttendanceType) type: AttendanceType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceItem)
  records: BulkAttendanceItem[];
}

export class BulkAttendanceItem {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty({ enum: AttendanceStatus }) @IsEnum(AttendanceStatus) status: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) reasonCategory?: string;
}

export class MarkTeacherAttendanceDto {
  @ApiProperty() @IsUUID() teacherId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: AttendanceStatus }) @IsEnum(AttendanceStatus) status: AttendanceStatus;
}

export class TeacherQrScanDto {
  @ApiProperty({ description: 'Teacher QR code data' }) @IsString() @MaxLength(255) qrData: string;
}

export class NfcScanDto {
  @ApiProperty({ description: 'Raw NFC card UID string' }) @IsString() @MaxLength(255) nfcCardId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ enum: AttendanceType }) @IsOptional() @IsEnum(AttendanceType) type?: AttendanceType;
}

export class RegisterNfcCardDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty({ description: 'Raw NFC card UID string' }) @IsString() @MaxLength(255) nfcCardId: string;
}

export class QueryAttendanceDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
