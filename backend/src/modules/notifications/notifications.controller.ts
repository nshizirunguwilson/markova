import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationDto,
  BulkNotificationDto,
  RegisterPushTokenDto,
} from './dto';
import { Roles, ANY_ROLE } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Send a notification' })
  send(@Body() dto: CreateNotificationDto) {
    return this.service.send(dto);
  }

  @Post('bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Send bulk notifications' })
  sendBulk(@Body() dto: BulkNotificationDto) {
    return this.service.sendBulk(dto);
  }

  @Get()
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Get user notifications' })
  getNotifications(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.service.getUserNotifications(
      user.id,
      limit ? Number(limit) : 50,
    );
  }

  @Get('unread')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.service.getUnreadCount(user.id);
  }

  @Put(':id/read')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.markAsRead(id, user.id);
  }

  @Put('read-all')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: any) {
    return this.service.markAllAsRead(user.id);
  }

  @Post('push-token')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Register push notification token' })
  registerPushToken(
    @Body() body: RegisterPushTokenDto,
    @CurrentUser() user: any,
  ) {
    /* Registered to the login, so the phone hears from every school the
       person belongs to, not only the one open now. */
    return this.service.registerPushToken(
      user.accountId,
      body.token,
      body.platform,
    );
  }
}
