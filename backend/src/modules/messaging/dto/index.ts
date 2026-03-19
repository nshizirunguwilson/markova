import { IsString, IsOptional, IsUUID, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ enum: ['ONE_ON_ONE', 'GROUP', 'BROADCAST'] }) @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('all', { each: true }) participantUserIds: string[];
}

export class SendMessageDto {
  @ApiProperty() @IsUUID() conversationId: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional({ enum: ['TEXT', 'FILE', 'VOICE'] }) @IsOptional() @IsString() contentType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileUrl?: string;
}

export class MarkReadDto {
  @ApiProperty() @IsUUID() conversationId: string;
}
