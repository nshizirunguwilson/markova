import {
  IsIn,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NotificationType {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
}

export class CreateNotificationDto {
  @ApiProperty() @IsUUID() userId: string;
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiProperty() @IsString() @MaxLength(1000) message: string;
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  relatedEntityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() relatedEntityId?: string;
}

export class BulkNotificationDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  userIds: string[];
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiProperty() @IsString() @MaxLength(1000) message: string;
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;
}

/** A phone, registered for push notifications. */
export class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  token: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  platform: string;
}
