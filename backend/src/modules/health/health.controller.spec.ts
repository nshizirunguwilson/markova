import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * The two questions a load balancer asks, which are not the same question.
 *
 * "Is this process alive" decides whether to restart the container. "Can it
 * serve" decides whether to send it traffic. Answering both from one endpoint
 * that checks the database means a database hiccup restarts all three
 * instances at once, which turns a slow query into an outage and loses every
 * in-flight request with it.
 */
describe('the health endpoints', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };
  const controller = new HealthController(prisma as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
  });

  describe('am I alive', () => {
    it('answers without asking anything else', async () => {
      expect(controller.live().status).toBe('ok');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(redis.ping).not.toHaveBeenCalled();
    });

    /*
      The important one. If this answered on the database, one slow database
      would restart every instance at the same moment.
    */
    it('still says alive when the database is down', () => {
      prisma.$queryRaw.mockRejectedValue(new Error('no connection'));
      expect(controller.live().status).toBe('ok');
    });

    it('says how long it has been up, which is what a restart loop shows', () => {
      expect(typeof controller.live().uptime).toBe('number');
    });
  });

  describe('can I serve', () => {
    it('says yes when both dependencies answer', async () => {
      const out = await controller.ready();
      expect(out.status).toBe('ok');
      expect(out.checks.database.status).toBe('ok');
      expect(out.checks.redis.status).toBe('ok');
    });

    /* A 503, not a 200 with a sad body: a balancer reads the status code and
       nothing else. */
    it('refuses traffic when the database is unreachable', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('no connection'));
      await expect(controller.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('refuses traffic when Redis is unreachable', async () => {
      redis.ping.mockRejectedValue(new Error('no connection'));
      await expect(controller.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('says which one was unreachable, so the page is actionable', async () => {
      redis.ping.mockRejectedValue(new Error('no connection'));
      await expect(controller.ready()).rejects.toMatchObject({
        response: { checks: { redis: { status: 'error' } } },
      });
    });
  });

  describe('the full report', () => {
    it('carries the latency of each dependency', async () => {
      const out = await controller.check();
      expect(out.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(out.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
    });

    /* Degraded rather than an error: this endpoint is for a person looking at
       it, and it should still render the half that works. */
    it('reports degraded rather than refusing when something is down', async () => {
      redis.ping.mockRejectedValue(new Error('no connection'));
      const out = await controller.check();
      expect(out.status).toBe('degraded');
      expect(out.checks.database.status).toBe('ok');
    });

    it('reports memory, which is what a leak shows up in first', async () => {
      const out = await controller.check();
      expect(out.memory.rss).toMatch(/MB$/);
    });
  });
});
