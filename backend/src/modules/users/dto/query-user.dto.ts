import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto';

export class QueryUserDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED'],
    description: 'Filter students by enrollment status',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED'])
  studentStatus?: string;
}
