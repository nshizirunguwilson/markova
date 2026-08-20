import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  MaxLength,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Role,
  Gender,
  EmploymentStatus,
  StudentStatus,
  TeacherQualification,
} from '@prisma/client';

export class ChildLinkDto {
  @ApiProperty({ example: 'student-uuid' })
  @IsUUID()
  studentId: string;

  @ApiProperty({ example: 'Father' })
  @IsString()
  @MaxLength(255)
  relationship: string;
}

export class CreateUserDto {
  // NIDA national ID: status digit, birth year, gender digit (8 male /
  // 7 female), birth order, issuance count, security code. Spaces allowed
  // on input; stored without them.
  @ApiPropertyOptional({ example: '1 2008 8 0123456 0 12' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @Matches(/^[123]\d{4}[78]\d{10}$/, {
    message:
      'National ID must be 16 digits: status (1-3), birth year, gender digit (7 or 8), then 10 digits',
  })
  nationalId?: string;

  @ApiPropertyOptional({ example: 'Rwandan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @ApiPropertyOptional({ example: 'user@markova.edu' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+250788000001' })
  @IsOptional()
  @Matches(/^\+250(78|79|72|73)\d{7}$/, {
    message:
      'Phone must be a real Rwandan mobile: +250 then 78, 79, 72 or 73 and 7 digits',
  })
  phone?: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/, {
    message:
      'Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character',
  })
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MaxLength(255)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MaxLength(255)
  lastName: string;

  // ─── Student-specific fields ──────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'class-section-uuid' })
  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @ApiPropertyOptional({ example: '2008-05-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  enrollmentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  medicalConditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  previousSchool?: string;

  @ApiPropertyOptional({ example: 'Kigali City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: 'Gasabo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ example: 'Kacyiru' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cell?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  village?: string;

  @ApiPropertyOptional({ description: 'Special-needs record; omit for none' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  disability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fatherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motherName?: string;

  @ApiPropertyOptional({ description: 'Mutuelle or other insurance number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  insuranceNumber?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Raw-object read: implicit conversion would turn the string "false" into
  // true before a value-based transform could see it.
  @Transform(({ obj }) => {
    const raw = obj.isBoarder;
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isBoarder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  religion?: string;

  // ─── Teacher-specific fields ──────────────────────────────────────────────
  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional({ enum: TeacherQualification })
  @IsOptional()
  @IsEnum(TeacherQualification)
  qualification?: TeacherQualification;

  @ApiPropertyOptional({ description: 'RSSB social security number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rssbNumber?: string;

  @ApiPropertyOptional({ example: '2024-09-01' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  // ─── Parent-specific fields ───────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Student IDs to link to parent',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ example: 'Father' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  relationship?: string;

  @ApiPropertyOptional({
    description: 'Children with their own relationship each',
    type: [ChildLinkDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildLinkDto)
  children?: ChildLinkDto[];
}
