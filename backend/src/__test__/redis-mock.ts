import { RedisService } from '../redis/redis.service';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
};

export function createMockRedis(): MockRedis & RedisService {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as MockRedis & RedisService;
}
