import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { MessagingGateway } from './messaging.gateway';
import {
  AddParticipantsDto,
  BroadcastDto,
  CreateConversationDto,
  MarkReadDto,
  PreviewAudienceDto,
  RenameConversationDto,
  SendMessageDto,
} from './dto';
import {
  isAllowedAttachmentMime,
  safeAttachmentExtension,
} from '../../common/file-validation';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Where an attachment is stored.
 *
 * The extension comes from the accepted mime type, never from the uploaded
 * filename. Express serves /uploads by extension, so a file allowed to name
 * itself comes back with whatever content type that implies.
 */
const attachmentStorage = diskStorage({
  destination: './uploads/attachments',
  filename: (_req, file, cb) => {
    const ext = safeAttachmentExtension(file.mimetype);
    if (!ext) return cb(new Error('That kind of file cannot be sent'), '');
    cb(null, `${uuidv4()}${ext}`);
  },
});

@ApiTags('Messaging')
@Controller('messaging')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class MessagingController {
  constructor(
    private readonly service: MessagingService,
    private readonly gateway: MessagingGateway,
  ) {}

  @Post('conversations')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Create a conversation' })
  createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: any,
  ) {
    return this.service.createConversation(dto, user.id);
  }

  @Get('conversations')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'List user conversations' })
  getConversations(@CurrentUser() user: any) {
    return this.service.getConversations(user.id);
  }

  @Get('conversations/:id/messages')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getMessages(
      id,
      user.id,
      limit ? Number(limit) : 50,
      before,
    );
  }

  @Post('messages')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: any) {
    const message = await this.service.sendMessage(dto, user.id);
    await this.gateway.broadcastNewMessage(dto.conversationId, message);
    return message;
  }

  @Post('read')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Mark conversation as read' })
  markAsRead(@Body() dto: MarkReadDto, @CurrentUser() user: any) {
    return this.service.markAsRead(dto.conversationId, user.id);
  }

  @Get('unread')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Get total unread count' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.id);
  }

  @Get('contacts')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'List users the current user can message' })
  getContacts(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.service.getContacts(user.id, search);
  }

  // ─── BROADCAST ────────────────────────────────────────────────────────────
  // "Everyone in Senior 1's family needs to know by Friday" is the single most
  // common thing a school has to say. Staff only: an announcement to four
  // hundred families is not something a student sends.

  @Post('broadcast/preview')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'How many people an announcement would reach' })
  previewAudience(@Body() dto: PreviewAudienceDto) {
    return this.service.previewAudience(dto);
  }

  @Post('broadcast')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'Tell a whole audience at once' })
  async broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: any) {
    const result = await this.service.broadcast(dto, user.id);
    await this.gateway.broadcastNewMessage(
      result.conversation.id,
      result.conversation.messages[0],
    );
    return result;
  }

  // ─── GROUP MEMBERSHIP ─────────────────────────────────────────────────────

  @Get('conversations/:id/participants')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'Who is in this conversation' })
  getParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.getParticipants(id, user.id);
  }

  @Post('conversations/:id/participants')
  @Roles('ADMIN', 'TEACHER', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'Add people to a group' })
  addParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantsDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addParticipants(id, dto.userIds, user.id);
  }

  // Leaving is allowed to everybody; removing somebody else is checked in the
  // service, because only it knows who is a group admin.
  @Delete('conversations/:id/participants/:userId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'Remove somebody, or leave the group yourself' })
  removeParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeParticipant(id, userId, user.id);
  }

  @Put('conversations/:id/name')
  @Roles('ADMIN', 'TEACHER', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'Rename a group' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameConversationDto,
    @CurrentUser() user: any,
  ) {
    return this.service.renameConversation(id, dto.name, user.id);
  }

  // ─── ATTACHMENTS ──────────────────────────────────────────────────────────

  @Post('attachments')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: attachmentStorage,
      fileFilter: (_req, file, cb) => {
        // An exact list, not a suffix match. `application/png` is not an image
        // and `x-application/pdf` is not a PDF.
        if (!isAllowedAttachmentMime(file.mimetype)) {
          return cb(new Error('That kind of file cannot be sent'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file to attach to a message' })
  uploadAttachment(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was sent');
    return {
      fileUrl: `/uploads/attachments/${file.filename}`,
      // The name a person sees, kept apart from the name on disk.
      fileName: file.originalname,
      size: file.size,
    };
  }
}
