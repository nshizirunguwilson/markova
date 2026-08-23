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

  /** The name the sender's file had, so the recipient knows what it is. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
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

// ─── BROADCAST ──────────────────────────────────────────────────────────────

/** Who an announcement is aimed at. */
export enum BroadcastAudience {
  ALL_PARENTS = 'ALL_PARENTS',
  ALL_TEACHERS = 'ALL_TEACHERS',
  ALL_STUDENTS = 'ALL_STUDENTS',
  ALL_STAFF = 'ALL_STAFF',
  /** Parents of the students in the named year levels. */
  PARENTS_OF_LEVELS = 'PARENTS_OF_LEVELS',
  /** Parents of the students in the named classes. */
  PARENTS_OF_CLASSES = 'PARENTS_OF_CLASSES',
  STUDENTS_OF_LEVELS = 'STUDENTS_OF_LEVELS',
  STUDENTS_OF_CLASSES = 'STUDENTS_OF_CLASSES',
}

export class BroadcastDto {
  @ApiProperty({ enum: BroadcastAudience })
  @IsEnum(BroadcastAudience)
  audience: BroadcastAudience;

  /** What the announcement is called in a list of conversations. */
  @ApiProperty() @IsString() @MaxLength(200) title: string;

  @ApiProperty() @IsString() @MaxLength(5000) message: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  classLevelIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  classSectionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class PreviewAudienceDto {
  @ApiProperty({ enum: BroadcastAudience })
  @IsEnum(BroadcastAudience)
  audience: BroadcastAudience;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  classLevelIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  classSectionIds?: string[];
}

export class AddParticipantsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  userIds: string[];
}

export class RenameConversationDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;
}
