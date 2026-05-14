import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { CreateConversationDto, SendMessageDto, MarkReadDto } from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Messaging')
@Controller('messaging')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

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
  sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: any) {
    return this.service.sendMessage(dto, user.id);
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
}
