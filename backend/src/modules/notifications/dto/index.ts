import { IsString, IsOptional, IsUUID, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty() @IsUUID() userId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() message: string;
  @ApiProperty({ enum: ['SMS', 'EMAIL', 'PUSH'] }) @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relatedEntityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() relatedEntityId?: string;
}

export class BulkNotificationDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('all', { each: true }) userIds: string[];
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() message: string;
  @ApiProperty({ enum: ['SMS', 'EMAIL', 'PUSH'] }) @IsString() type: string;
}
