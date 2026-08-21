import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({ example: 'wilsonshizirungu@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+250788000001' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(6)
  // bcrypt reads at most 72 bytes and silently drops the rest, so two long
  // passwords sharing a 72 byte prefix are one password to it. OWASP asks for
  // this cap to be stated rather than left implied.
  @MaxLength(72)
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'session-uuid-here' })
  @IsString()
  sessionId: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  otp: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'session-uuid-here' })
  @IsString()
  sessionId: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  // bcrypt reads at most 72 bytes and silently drops the rest, so two long
  // passwords sharing a 72 byte prefix are one password to it. OWASP asks for
  // this cap to be stated rather than left implied.
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/, {
    message:
      'Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character',
  })
  // bcrypt reads at most 72 bytes and silently drops the rest, so two long
  // passwords sharing a 72 byte prefix are one password to it. OWASP asks for
  // this cap to be stated rather than left implied.
  @MaxLength(72)
  newPassword: string;
}

export class RequestPasswordResetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/, {
    message:
      'Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character',
  })
  // bcrypt reads at most 72 bytes and silently drops the rest, so two long
  // passwords sharing a 72 byte prefix are one password to it. OWASP asks for
  // this cap to be stated rather than left implied.
  @MaxLength(72)
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
