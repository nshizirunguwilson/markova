import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
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

  /**
   * Signing in on a shared computer: a school lab, a cyber café. The sign in
   * then ends when the browser closes, after ten minutes without use, and at
   * the end of the day. A student is always treated as on one.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sharedDevice?: boolean;
}

/** Signing out of this computer, or of every device. */
export class LogoutDto {
  /** The refresh token this computer holds: its session is the one ended. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  everywhere?: boolean;
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

/** Open another of the signed-in person's schools. */
export class SwitchSchoolDto {
  @ApiProperty({ description: 'The school record to open, from /auth/schools' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description:
      'The refresh token in hand. Its session moves to the new school rather than staying open on the old one.',
  })
  @IsString()
  refreshToken: string;
}

/**
 * A new email or phone to sign in with. One of the two.
 *
 * Only the person can change how they sign in, and only after proving they
 * hold the new one: a code goes to it, and nothing changes until it comes
 * back.
 */
export class ChangeLoginDto {
  @ApiPropertyOptional({ example: 'aline.uwase@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+250788123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ]{9,15}$/, { message: 'Enter a phone number' })
  phone?: string;
}

export class ConfirmLoginChangeDto {
  @ApiProperty()
  @IsString()
  sessionId: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
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
