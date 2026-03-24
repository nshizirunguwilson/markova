import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  async check() {
    const timestamp = new Date().toISOString();
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    // Check database connectivity
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'error' };
    }

    // Check Redis connectivity
    try {
      const redisStart = Date.now();
      await this.redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } catch {
      checks.redis = { status: 'error' };
    }

    const overallStatus = Object.values(checks).every((c) => c.status === 'ok')
      ? 'ok'
      : 'degraded';

    const memoryUsage = process.memoryUsage();

    return {
      status: overallStatus,
      version: process.env.npm_package_version || '1.0.0',
      timestamp,
      uptime: `${uptimeSeconds}s`,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      },
      checks,
    };
  }
}
