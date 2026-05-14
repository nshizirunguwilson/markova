import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ConversationType {
  ONE_ON_ONE = 'ONE_ON_ONE',
  GROUP = 'GROUP',
  BROADCAST = 'BROADCAST',
}

export enum MessageContentType {
  TEXT = 'TEXT',
  FILE = 'FILE',
  VOICE = 'VOICE',
}

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType })
  @IsEnum(ConversationType)
  type: ConversationType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  participantUserIds: string[];
}

export class SendMessageDto {
  @ApiProperty() @IsUUID() conversationId: string;
  @ApiProperty() @IsString() @MaxLength(5000) content: string;
  @ApiPropertyOptional({ enum: MessageContentType })
  @IsOptional()
  @IsEnum(MessageContentType)
  contentType?: MessageContentType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fileUrl?: string;
}

export class MarkReadDto {
  @ApiProperty() @IsUUID() conversationId: string;
}

export class QueryConversationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class QueryMessagesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
  @ApiPropertyOptional() @IsOptional() @IsString() before?: string;
}
