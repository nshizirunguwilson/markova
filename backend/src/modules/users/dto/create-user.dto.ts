import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsDateString,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Gender, EmploymentStatus, StudentStatus } from '@prisma/client';

export class CreateUserDto {
  @ApiPropertyOptional({ example: 'user@markova.academy' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+256700000001' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  // ─── Student-specific fields ──────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'class-section-uuid' })
  @IsOptional()
  @IsString()
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

  // ─── Teacher-specific fields ──────────────────────────────────────────────
  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

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
  relationship?: string;
}
