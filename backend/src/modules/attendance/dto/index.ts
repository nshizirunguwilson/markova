import { IsUUID, IsEnum, IsOptional, IsString, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AttendanceType {
  DAILY = 'daily',
  SUBJECT = 'subject',
}

export class MarkAttendanceDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: AttendanceType }) @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiProperty({ enum: ['PRESENT', 'ABSENT', 'LATE'] }) @IsEnum({ PRESENT: 'PRESENT', ABSENT: 'ABSENT', LATE: 'LATE' }) status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reasonCategory?: string;
}

export class QrScanDto {
  @ApiProperty({ description: 'Student ID number or QR code data' }) @IsString() qrData: string;
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ enum: AttendanceType }) @IsOptional() @IsString() type?: string;
}

export class BulkAttendanceDto {
  @ApiProperty() @IsUUID() classSectionId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: AttendanceType }) @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceItem)
  records: BulkAttendanceItem[];
}

export class BulkAttendanceItem {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty({ enum: ['PRESENT', 'ABSENT', 'LATE'] }) @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reasonCategory?: string;
}

export class MarkTeacherAttendanceDto {
  @ApiProperty() @IsUUID() teacherId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: ['PRESENT', 'ABSENT', 'LATE'] }) @IsString() status: string;
}

export class TeacherQrScanDto {
  @ApiProperty({ description: 'Teacher QR code data' }) @IsString() qrData: string;
}

export class QueryAttendanceDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classSectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
}
