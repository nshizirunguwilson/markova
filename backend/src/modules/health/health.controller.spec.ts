import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;

  const mockPrisma: any = { $queryRaw: jest.fn() };
  const mockRedis: any = { ping: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  it('reports ok when both dependencies answer', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedis.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.redis.status).toBe('ok');
  });

  it('reports degraded — not a crash — when Postgres is unreachable', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    mockRedis.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('error');
    expect(result.checks.redis.status).toBe('ok');
  });

  it('reports degraded when Redis is unreachable', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockRedis.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis.status).toBe('error');
  });

  it('never leaks the underlying error to the caller', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(
      new Error('password authentication failed for user "markova"'),
    );
    mockRedis.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('includes uptime, version and memory for operators', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result.uptime).toMatch(/^\d+s$/);
    expect(result.version).toBeTruthy();
    expect(result.memory.rss).toMatch(/^\d+MB$/);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('measures how long each dependency took', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
