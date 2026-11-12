import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FirstAdminDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) firstName: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) lastName: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'phone must be a phone number' })
  phone?: string;
}

export class CreateSchoolDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(120) name: string;

  /** Short, readable and unique: used in addresses and codes. */
  @ApiProperty({ example: 'gs-umucyo' })
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug is lowercase letters, digits and hyphens, like gs-umucyo',
  })
  slug: string;

  /** The principal the school starts with. */
  @ApiProperty({ type: FirstAdminDto })
  @ValidateNested()
  @Type(() => FirstAdminDto)
  admin: FirstAdminDto;
}
