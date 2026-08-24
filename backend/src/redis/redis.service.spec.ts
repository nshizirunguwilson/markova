import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

const construct = jest.fn();
const quit = jest.fn().mockResolvedValue('OK');

jest.mock('ioredis', () => ({
  __esModule: true,
  default: class {
    constructor(url: string) {
      construct(url);
    }
    quit = quit;
  },
}));

/**
 * The Redis handle.
 *
 * OTP sessions, failed sign-in counts and password reset tokens all live here
 * rather than in process memory, which is what lets a school run more than one
 * instance and survive a restart mid-login.
 */
describe('RedisService', () => {
  const config = (url?: string) =>
    ({ get: () => url }) as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('connects to the address the deployment configured', () => {
    new RedisService(config('redis://cache.internal:6379'));
    expect(construct).toHaveBeenCalledWith('redis://cache.internal:6379');
  });

  // A developer running the stack locally has Redis on the default port and
  // no reason to configure anything.
  it('falls back to a local Redis when none was configured', () => {
    new RedisService(config(undefined));
    expect(construct).toHaveBeenCalledWith('redis://localhost:6379');
  });

  it('closes the connection when the application stops', async () => {
    const service = new RedisService(config('redis://localhost:6379'));
    await service.onModuleDestroy();
    expect(quit).toHaveBeenCalled();
  });
});
