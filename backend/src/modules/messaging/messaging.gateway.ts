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
   * Everyone in a conversation, addressed by their personal room.
   *
   * `conv:<id>` rooms are joined once, at connection time, so a conversation
   * created after a socket connected does not contain that socket — which is
   * why read receipts, typing and presence all went missing for exactly the
   * conversations people had just started. A user's own `user:<id>` room is
   * always current, so everything that has to reach a participant goes
   * through here.
   */
  private async participantRooms(
    conversationId: string,
    exceptUserId?: string,
  ): Promise<string[]> {
    const ids =
      await this.messagingService.getConversationParticipantIds(conversationId);
    return ids
      .filter((id) => id !== exceptUserId)
      .map((id) => `user:${id}`);
  }

  /** Broadcast a newly-created message to each participant. */
  async broadcastNewMessage(conversationId: string, message: unknown) {
    const rooms = await this.participantRooms(conversationId);
    if (rooms.length > 0) {
      this.server.to(rooms).emit('newMessage', message);
    }
  }

  /**
   * Mark a message delivered to whoever is online, and tell the sender.
   *
   * Shared with the REST route: an attachment goes over HTTP rather than the
   * socket (the socket carries text only), and that path never ran this at
   * all — so a message with a file stayed on one tick until the recipient
   * next reconnected.
   */
  async markDeliveredIfOnline(
    conversationId: string,
    messageId: string,
    senderUserId: string,
  ): Promise<boolean> {
    const participantIds =
      await this.messagingService.getConversationParticipantIds(conversationId);
    const online = participantIds.some(
      (id) => id !== senderUserId && this.onlineUsers.has(id),
    );
    if (!online) return false;

    await this.messagingService.updateMessageStatus(messageId, 'DELIVERED');
    // The sender's room, not the one socket that sent it: someone with the
    // dashboard open in two tabs saw the second tick in only one of them.
    this.server.to(`user:${senderUserId}`).emit('messageDelivered', {
      messageId,
      conversationId,
    });
    return true;
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
      // The JWT carries `sub` and `role` only (see AuthService.issueTokens),
      // so the typing indicator's `${firstName} ${lastName}` was always the
      // empty string and every recipient saw " is typing". The name is read
      // once here, off the record already loaded to authorise the socket.
      client.data.displayName =
        `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
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

      // Send current online users to the connecting client.
      //
      // Only the people they share a conversation with. This list used to be
      // every socket connected to the server, which both told a student who
      // else in the school was at their desk and — because the corrections
      // that follow (`presenceChange`) are limited to conversation partners —
      // left a green dot next to a stranger lit until the page was reloaded.
      const partners = await this.messagingService.getConversationPartnerIds(userId);
      const onlineList = partners.filter((id) => this.onlineUsers.has(id));
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
    const delivered = await this.markDeliveredIfOnline(
      data.conversationId,
      message.id,
      userId,
    );

    // Ack back to sender
    return {
      messageId: message.id,
      status: delivered ? 'DELIVERED' : 'SENT',
    };
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

    // Notify senders their messages were read. Addressed to every
    // participant's own room rather than the conversation room: the sender is
    // only in `conv:<id>` if the conversation already existed when they
    // connected, so read receipts silently never arrived for a thread that
    // had just been started.
    if (result.readMessageIds && result.readMessageIds.length > 0) {
      const rooms = await this.participantRooms(data.conversationId);
      if (rooms.length > 0) {
        this.server.to(rooms).emit('messagesRead', {
          conversationId: data.conversationId,
          readBy: userId,
          messageIds: result.readMessageIds,
        });
      }
    }

    return { count: result.count };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPING INDICATORS
  // ═══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user.sub;
    // Read off the socket, where it was cached at connection. The JWT does
    // not carry a name, so this used to be the empty string every time.
    const userName = client.data.displayName || '';

    const rooms = await this.participantRooms(data.conversationId, userId);
    if (rooms.length === 0) return;
    this.server.to(rooms).emit('userTyping', {
      conversationId: data.conversationId,
      userId,
      userName,
    });
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user.sub;

    const rooms = await this.participantRooms(data.conversationId, userId);
    if (rooms.length === 0) return;
    this.server.to(rooms).emit('userStopTyping', {
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
    const convIds = await this.messagingService.getUserConversationIds(userId);
    if (convIds.length === 0) return;

    // Addressed to the people, not the conversation rooms — and de-duplicated,
    // so somebody sharing four conversations with this user is told once
    // rather than four times.
    const rooms = new Set<string>();
    for (const convId of convIds) {
      for (const room of await this.participantRooms(convId, userId)) {
        rooms.add(room);
      }
    }
    if (rooms.size === 0) return;

    this.server.to([...rooms]).emit('presenceChange', {
      userId,
      isOnline,
      lastSeenAt: lastSeen || new Date(),
    });
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }
}
