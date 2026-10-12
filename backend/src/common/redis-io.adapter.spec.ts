const redis = {
  ping: jest.fn().mockResolvedValue('PONG'),
  duplicate: jest.fn(),
};
redis.duplicate.mockReturnValue(redis);
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redis),
}));
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(() => 'the redis adapter'),
}));

import { IoAdapter } from '@nestjs/platform-socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { RedisIoAdapter } from './redis-io.adapter';

/**
 * Chat across more than one server: every emit goes through Redis, so a
 * message reaches people connected to another instance.
 */
describe('RedisIoAdapter', () => {
  const server = { adapter: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue(server);
  });

  it('opens a publisher and a subscriber, and checks both answer', async () => {
    const adapter = new RedisIoAdapter({} as never);
    await adapter.connect('redis://localhost:6380');
    expect(Redis).toHaveBeenCalledWith('redis://localhost:6380', {
      maxRetriesPerRequest: null,
    });
    expect(redis.duplicate).toHaveBeenCalled();
    expect(redis.ping).toHaveBeenCalledTimes(2);
    expect(createAdapter).toHaveBeenCalledWith(redis, redis);
  });

  it('wires every socket server it makes to Redis once connected', async () => {
    const adapter = new RedisIoAdapter({} as never);
    await adapter.connect('redis://x');
    expect(adapter.createIOServer(3000)).toBe(server);
    expect(server.adapter).toHaveBeenCalledWith('the redis adapter');
  });

  it('makes a plain server when Redis was never connected', () => {
    const adapter = new RedisIoAdapter({} as never);
    adapter.createIOServer(3000);
    expect(server.adapter).not.toHaveBeenCalled();
  });
});
