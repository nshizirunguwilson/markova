import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** The header the id travels on, in and out. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Gives every request an id, and hands it back on the response.
 *
 * With one server you can find a request in the log by its timestamp. With
 * three behind a load balancer you cannot: the lines are interleaved across
 * three files, a retry looks like a second unrelated request, and a websocket
 * event has no obvious connection to the call that caused it.
 *
 * An id fixes all three, and it has to come in at the very front so that
 * everything downstream can quote it.
 *
 * An incoming id is honoured rather than replaced. nginx generates one, and so
 * does the dashboard for a request it wants to be able to ask about later; a
 * middleware that overwrote it would break the trail exactly where it starts.
 * It is length-capped and stripped of anything but the characters an id can
 * hold, because it is attacker-controlled text on its way into log files.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = RequestIdMiddleware.clean(
      Array.isArray(incoming) ? incoming[0] : incoming,
    );

    (req as Request & { id: string }).id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }

  /**
   * A usable id, whatever arrived.
   *
   * Anything outside the allowed characters is thrown away rather than
   * escaped: this ends up in log files that people grep and tools parse, and a
   * newline in the middle of an id is a forged log line.
   */
  static clean(value: unknown): string {
    if (typeof value !== 'string') return randomUUID();
    const safe = value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
    return safe.length >= 8 ? safe : randomUUID();
  }
}
