import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OpenToFormerStudents } from '../../common/decorators';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { withPlatform } from '../../prisma/request-context';
import { AuthService } from './auth.service';
import {
  LoginDto,
  VerifyOtpDto,
  ResendOtpDto,
  RefreshTokenDto,
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  UpdateProfileDto,
  SwitchSchoolDto,
  ChangeLoginDto,
  ConfirmLoginChangeDto,
} from './dto';
import { CurrentUser } from '../../common/decorators';
import type { Request } from 'express';

@ApiTags('Auth')
// A student who has left still manages their own account.
@OpenToFormerStudents()
@Controller('auth')
/*
  Signing in, codes, refreshing a token and resetting a password all happen
  before anybody is known, so they run above the wall between schools
  (withPlatform): the person has to be found before their school is. Each of
  them reads and writes only the one person it is about. Everything else here
  runs after the guard, inside the signed-in person's school.
*/
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login with email/phone and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const deviceInfo = req.headers['user-agent'];
    return withPlatform(() =>
      this.authService.login(dto, ipAddress, deviceInfo),
    );
  }

  @Post('verify-otp')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Verify OTP to complete login' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const deviceInfo = req.headers['user-agent'];
    return withPlatform(() =>
      this.authService.verifyOtp(dto, ipAddress, deviceInfo),
    );
  }

  @Post('resend-otp')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Resend a verification code for a pending login' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return withPlatform(() => this.authService.resendOtp(dto));
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return withPlatform(() => this.authService.refreshToken(dto));
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (requires current password)' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('request-reset')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Request password reset via email or SMS' })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return withPlatform(() => this.authService.requestPasswordReset(dto));
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return withPlatform(() => this.authService.resetPassword(dto));
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session or all sessions' })
  async logout(
    @CurrentUser('accountId') accountId: string,
    @Headers('authorization') auth: string,
  ) {
    // Extract token from Bearer header for single-session logout
    const token = auth?.replace('Bearer ', '');
    return this.authService.logout(accountId, token);
  }

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions for current user' })
  async getSessions(@CurrentUser('accountId') accountId: string) {
    return this.authService.getSessions(accountId);
  }

  @Get('schools')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Every school the signed-in person can open, for the switcher',
  })
  async schools(
    @CurrentUser('accountId') accountId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.authService.schools(accountId, userId);
  }

  @Post('switch')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Open another of your schools' })
  async switchSchool(
    @CurrentUser('accountId') accountId: string,
    @Body() dto: SwitchSchoolDto,
  ) {
    return this.authService.switchSchool(
      accountId,
      dto.userId,
      dto.refreshToken,
    );
  }

  @Post('login-details')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start changing the email or phone you sign in with (sends a code)',
  })
  async requestLoginChange(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangeLoginDto,
  ) {
    return this.authService.requestLoginChange(userId, dto);
  }

  @Post('login-details/confirm')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Finish changing how you sign in, with the code' })
  async confirmLoginChange(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmLoginChangeDto,
  ) {
    return this.authService.confirmLoginChange(userId, dto);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile (name, phone)' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
