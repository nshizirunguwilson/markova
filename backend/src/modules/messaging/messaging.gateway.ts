import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from './messaging.service';

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: '/chat',
  maxHttpBufferSize: 1024 * 1024, // 1MB
})
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // userId -> Set<socketId>
  private onlineUsers = new Map<string, Set<string>>();

  // Rate limiting: userId -> timestamps of recent messages
  private messageTimestamps = new Map<string, number[]>();
  private readonly MSG_RATE_LIMIT = 30;
  private readonly MSG_RATE_WINDOW_MS = 60000; // 1 minute

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private messagingService: MessagingService,
  ) {}

  /**
   * Broadcast a newly-created message to each participant's personal user
   * room. We use the user rooms (not conv:<id>) because a conversation
   * created after a socket connected won't have that socket in conv:<id> yet,
   * but every connected user is always in their own user:<id> room.
   */
  async broadcastNewMessage(conversationId: string, message: unknown) {
    const participantIds =
      await this.messagingService.getConversationParticipantIds(conversationId);
    const rooms = participantIds.map((id) => `user:${id}`);
    if (rooms.length > 0) {
      this.server.to(rooms).emit('newMessage', message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || !user.isActive) {
        client.disconnect();
        return;
      }

      client.data.user = payload;
      const userId = payload.sub;

      // Track online status
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(client.id);

      // Join user's personal room
      void client.join(`user:${userId}`);

      // Join all conversation rooms
      const convIds =
        await this.messagingService.getUserConversationIds(userId);
      for (const convId of convIds) {
        void client.join(`conv:${convId}`);
      }

      // Broadcast online status to conversation partners
      await this.broadcastPresence(userId, true);

      // Send current online users to the connecting client
      const onlineList = Array.from(this.onlineUsers.keys());
      client.emit('onlineUsers', onlineList);

      // Mark undelivered messages as delivered
      const delivered = await this.messagingService.markDelivered(userId);
      if (delivered.length > 0) {
        // Notify senders their messages were delivered
        for (const msg of delivered) {
          this.server.to(`user:${msg.senderUserId}`).emit('messageDelivered', {
            messageId: msg.id,
            conversationId: msg.conversationId,
          });
        }
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.user?.sub;
    if (!userId) return;

    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(userId);

        // Update lastSeenAt
        const now = new Date();
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: now },
        });

        // Broadcast offline
        await this.broadcastPresence(userId, false, now);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  private checkMessageRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(userId) || [];
    const recent = timestamps.filter((t) => now - t < this.MSG_RATE_WINDOW_MS);
    if (recent.length >= this.MSG_RATE_LIMIT) {
      this.messageTimestamps.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.messageTimestamps.set(userId, recent);
    return true;
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      contentType?: string;
      fileUrl?: string;
    },
  ) {
    const userId = client.data.user.sub;

    if (!this.checkMessageRateLimit(userId)) {
      return { error: 'Rate limit exceeded. Max 30 messages per minute.' };
    }

    const message = await this.messagingService.sendMessage(
      {
        conversationId: data.conversationId,
        content: data.content,
        contentType: data.contentType as any,
        fileUrl: data.fileUrl,
      },
      userId,
    );

    await this.broadcastNewMessage(data.conversationId, message);

    // Check which recipients are online and mark delivered
    const participantIds =
      await this.messagingService.getConversationParticipantIds(
        data.conversationId,
      );
    const onlineRecipients = participantIds.filter(
      (id) => id !== userId && this.onlineUsers.has(id),
    );

    if (onlineRecipients.length > 0) {
      await this.messagingService.updateMessageStatus(message.id, 'DELIVERED');
      client.emit('messageDelivered', {
        messageId: message.id,
        conversationId: data.conversationId,
      });
    }

    // Ack back to sender
    return { messageId: message.id, status: 'SENT' };
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user.sub;

    const result = await this.messagingService.markAsRead(
      data.conversationId,
      userId,
    );

    // Notify senders their messages were read
    if (result.readMessageIds && result.readMessageIds.length > 0) {
      this.server.to(`conv:${data.conversationId}`).emit('messagesRead', {
        conversationId: data.conversationId,
        readBy: userId,
        messageIds: result.readMessageIds,
      });
    }

    return { count: result.count };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPING INDICATORS
  // ═══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user.sub;
    const userName =
      `${client.data.user.firstName || ''} ${client.data.user.lastName || ''}`.trim();

    client.to(`conv:${data.conversationId}`).emit('userTyping', {
      conversationId: data.conversationId,
      userId,
      userName,
    });
  }

  @SubscribeMessage('stopTyping')
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user.sub;

    client.to(`conv:${data.conversationId}`).emit('userStopTyping', {
      conversationId: data.conversationId,
      userId,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JOIN CONVERSATION (for newly created conversations)
  // ═══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    void client.join(`conv:${data.conversationId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async broadcastPresence(
    userId: string,
    isOnline: boolean,
    lastSeen?: Date,
  ) {
    // Get all conversation IDs for this user
    const convIds = await this.messagingService.getUserConversationIds(userId);

    for (const convId of convIds) {
      this.server.to(`conv:${convId}`).emit('presenceChange', {
        userId,
        isOnline,
        lastSeenAt: lastSeen || new Date(),
      });
    }
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }
}
