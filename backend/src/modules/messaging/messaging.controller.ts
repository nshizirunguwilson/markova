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
  fileFilterFor,
  filenameFor,
  removeStoredFile,
  validateUploadedAttachment,
} from '../../common/file-validation';
import {
  attachmentKind,
  maxBytesFor,
  tooLargeMessage,
  MAX_ANY_ATTACHMENT_BYTES,
} from '../../common/attachment-limits';
import * as fsModule from 'fs';
import { Roles, ANY_ROLE } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Where an attachment is stored.
 *
 * The extension comes from the accepted mime type, never from the uploaded
 * filename. Express serves /uploads by extension, so a file allowed to name
 * itself comes back with whatever content type that implies.
 */
const ATTACHMENT_REFUSAL = 'That kind of file cannot be sent';

const attachmentStorage = diskStorage({
  destination: './uploads/attachments',
  // The extension comes from the accepted mime type, never from the uploaded
  // filename. Express serves /uploads by extension, so a file allowed to name
  // itself comes back with whatever content type that implies.
  filename: filenameFor('attachment', uuidv4, ATTACHMENT_REFUSAL),
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
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Create a conversation' })
  createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: any,
  ) {
    return this.service.createConversation(dto, user.id);
  }

  @Get('conversations')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'List user conversations' })
  getConversations(@CurrentUser() user: any) {
    return this.service.getConversations(user.id);
  }

  @Get('conversations/:id/messages')
  @Roles(...ANY_ROLE)
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
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: any) {
    const message = await this.service.sendMessage(dto, user.id);
    await this.gateway.broadcastNewMessage(dto.conversationId, message);
    // The socket carries text only, so anything with an attachment comes
    // through here - and this path never checked delivery, leaving every
    // message with a file on one tick until the recipient next reconnected.
    const delivered = await this.gateway.markDeliveredIfOnline(
      dto.conversationId,
      message.id,
      user.id,
    );
    return delivered ? { ...message, status: 'DELIVERED' } : message;
  }

  @Post('read')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Mark conversation as read' })
  markAsRead(@Body() dto: MarkReadDto, @CurrentUser() user: any) {
    return this.service.markAsRead(dto.conversationId, user.id);
  }

  @Get('unread')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Get total unread count' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.id);
  }

  @Get('contacts')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'List users the current user can message' })
  getContacts(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.service.getContacts(user.id, search);
  }

  // ─── BROADCAST ────────────────────────────────────────────────────────────
  // "Everyone in Senior 1's family needs to know by Friday" is the single most
  // common thing a school has to say. Staff only: an announcement to four
  // hundred families is not something a student sends.

  @Post('broadcast/preview')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'NURSE', 'BURSAR')
  @ApiOperation({ summary: 'How many people an announcement would reach' })
  previewAudience(@Body() dto: PreviewAudienceDto) {
    return this.service.previewAudience(dto);
  }

  @Post('broadcast')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'NURSE', 'BURSAR')
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
  @Roles(
    'ADMIN',
    'TEACHER',
    'STUDENT',
    'PARENT',
    'LIBRARIAN',
    'PATRON',
    'MATRON',
    'NURSE',
    'BURSAR',
  )
  @ApiOperation({ summary: 'Who is in this conversation' })
  getParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.getParticipants(id, user.id);
  }

  @Post('conversations/:id/participants')
  @Roles('ADMIN', 'TEACHER', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE', 'BURSAR')
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
  @Roles(
    'ADMIN',
    'TEACHER',
    'STUDENT',
    'PARENT',
    'LIBRARIAN',
    'PATRON',
    'MATRON',
    'NURSE',
    'BURSAR',
  )
  @ApiOperation({ summary: 'Remove somebody, or leave the group yourself' })
  removeParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeParticipant(id, userId, user.id);
  }

  @Put('conversations/:id/name')
  @Roles('ADMIN', 'TEACHER', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE', 'BURSAR')
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
  @Roles(
    'ADMIN',
    'TEACHER',
    'STUDENT',
    'PARENT',
    'LIBRARIAN',
    'PATRON',
    'MATRON',
    'NURSE',
    'BURSAR',
  )
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: attachmentStorage,
      fileFilter: fileFilterFor('attachment', ATTACHMENT_REFUSAL),
      /*
        Multer takes one number, so it gets the largest of the four caps and
        the per-kind cap is applied below. A 40MB spreadsheet is refused, but
        only after it has arrived - which is why the web checks the size
        before uploading anything, and this is the backstop.
      */
      limits: { fileSize: MAX_ANY_ATTACHMENT_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file to attach to a message' })
  uploadAttachment(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was sent');

    // A video may be 50MB; a photograph may not. Over the cap for its own
    // kind, the file goes back off disk before anything can point at it.
    if (file.size > maxBytesFor(file.mimetype)) {
      removeStoredFile(file.path, fsModule, (p) => p);
      throw new BadRequestException(tooLargeMessage(file.mimetype, file.size));
    }

    // And it has to be what it said it was. The declared type decided the
    // extension, and /uploads is served by extension.
    validateUploadedAttachment(file.path, file.mimetype);

    return {
      fileUrl: `/uploads/attachments/${file.filename}`,
      // The name a person sees, kept apart from the name on disk.
      fileName: file.originalname,
      size: file.size,
      kind: attachmentKind(file.mimetype),
      mimeType: file.mimetype,
    };
  }
}
