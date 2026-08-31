import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Makes chat work across more than one server.
 *
 * A socket.io server keeps its rooms in the memory of the process holding
 * them. With one instance that is fine. With three behind a load balancer,
 * Aline's browser is connected to api-1 and Jean's to api-3, and a message
 * Aline sends is emitted into api-1's rooms, where Jean is not.
 *
 * The failure is quiet, which is what makes it worth guarding: chat works
 * perfectly for two people who happen to land on the same instance, and does
 * nothing at all for two who do not. There is no error to see, on either end.
 *
 * The Redis adapter fixes it by publishing every emit to Redis, so all three
 * instances deliver to whichever sockets they hold.
 *
 * Two connections rather than one because Redis pub/sub puts a connection into
 * subscriber mode, where it may not run ordinary commands. They are separate
 * from the application's own Redis client for the same reason.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapter?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(url: string): Promise<void> {
    const publisher = new Redis(url, { maxRetriesPerRequest: null });
    const subscriber = publisher.duplicate();
    await Promise.all([publisher.ping(), subscriber.ping()]);
    this.adapter = createAdapter(publisher, subscriber);
    this.logger.log('Chat is wired across instances through Redis');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapter) {
      (server as { adapter: (a: unknown) => void }).adapter(this.adapter);
    }
    return server;
  }
}
