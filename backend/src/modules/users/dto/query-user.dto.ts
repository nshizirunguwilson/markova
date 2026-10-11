import { IsEnum, IsIn, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role, StudentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto';

export class QueryUserDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  // Read the raw query string: with enableImplicitConversion the pipe turns
  // the string "false" into boolean true before a value-based transform runs.
  @Transform(({ obj }) => {
    const raw = obj.isActive;
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @ApiPropertyOptional({
    enum: StudentStatus,
    description: 'Filter students by enrollment status',
  })
  @IsOptional()
  @IsEnum(StudentStatus)
  studentStatus?: StudentStatus;

  @ApiPropertyOptional({
    enum: ['all', 'name', 'class', 'email', 'phone', 'code', 'role', 'status'],
    description: 'Restrict the search to one field group',
  })
  @IsOptional()
  @IsIn(['all', 'name', 'class', 'email', 'phone', 'code', 'role', 'status'])
  searchIn?: string;
}
