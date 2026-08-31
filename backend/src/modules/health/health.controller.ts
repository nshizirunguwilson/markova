import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Is this process alive?
   *
   * Deliberately checks nothing. A load balancer asks this to decide whether
   * to restart the container, and if it answered on the database then a
   * database hiccup would restart all three instances at once, which turns a
   * slow query into an outage and loses every in-flight request with it.
   *
   * The only thing that fails this is a process that cannot answer at all.
   */
  @Get('live')
  live() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Can this process serve a request?
   *
   * This is the one the balancer takes instances out of rotation on, so it
   * does check the dependencies: an instance that cannot reach Postgres will
   * answer every request with a 500, and it is better to send the traffic to
   * its two siblings.
   *
   * Answers 503 rather than a 200 with a sad body, because a balancer reads
   * the status code and nothing else.
   */
  @Get('ready')
  @HttpCode(200)
  async ready() {
    const checks = await this.probe();
    const ok = Object.values(checks).every((c) => c.status === 'ok');
    if (!ok) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks,
      });
    }
    return { status: 'ok', checks };
  }

  @Get()
  async check() {
    const timestamp = new Date().toISOString();
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    const checks = await this.probe();

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

  /** Whether the things this process needs are reachable, and how quickly. */
  private async probe(): Promise<
    Record<string, { status: string; latencyMs?: number }>
  > {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    try {
      const started = Date.now();
      // A constant, in a tagged template. Prisma parameterises these, and
      // there is nothing here to parameterise.
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - started };
    } catch {
      checks.database = { status: 'error' };
    }

    try {
      const started = Date.now();
      await this.redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - started };
    } catch {
      checks.redis = { status: 'error' };
    }

    return checks;
  }
}
