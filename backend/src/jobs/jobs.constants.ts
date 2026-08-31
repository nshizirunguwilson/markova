/**
 * The work that must not happen on a request thread.
 *
 * Rendering one report card starts a headless Chrome page, lays out an A4
 * sheet and returns a buffer. It costs hundreds of milliseconds and a good
 * deal of memory, and until now it happened inside the HTTP request, which
 * means one parent opening their child's card occupied a server slot for the
 * whole of it.
 *
 * A class of thirty is thirty of those, one after another, and the end of term
 * is precisely when several members of staff do that at once. That is the
 * moment a school actually loads this system, and it was the moment it would
 * fall over.
 */

/** The queue name. One queue, because the work is all the same shape. */
export const RENDER_QUEUE = 'render';

/**
 * Outbound messages: email and SMS.
 *
 * A separate queue from rendering, because the two fail for different reasons
 * and want different retries. A render fails because Chrome fell over, and
 * trying again in two seconds is right. A message fails because somebody
 * else's mail server is down, and trying again in two seconds is pointless:
 * it wants minutes, and many more attempts.
 *
 * The reason this exists at all is that staff sign-in needs an OTP. Sending it
 * inline meant a momentary SMTP hiccup dropped the code silently, and the
 * member of staff simply could not sign in, with nothing anywhere saying why.
 */
export const DELIVERY_QUEUE = 'delivery';

export const DeliveryJob = {
  EMAIL: 'email',
  SMS: 'sms',
} as const;

export type DeliveryJobName = (typeof DeliveryJob)[keyof typeof DeliveryJob];

/**
 * How hard to try, and how long to wait between attempts.
 *
 * Six attempts on an exponential backoff from thirty seconds reaches about
 * fifteen minutes. That is chosen against the thing being delivered: a
 * sign-in code is worthless after fifteen minutes anyway, and a provider
 * outage longer than that is not something retrying will solve.
 */
export const DELIVERY_ATTEMPTS = 6;
export const DELIVERY_BACKOFF_MS = 30_000;

/** How many messages may be in flight at once, per worker. */
export const DELIVERY_CONCURRENCY = Number(
  process.env.DELIVERY_CONCURRENCY || 5,
);

export const RenderJob = {
  /** One student's report card for one term. */
  TERM_REPORT: 'term-report',
  /** One student's whole year. */
  YEAR_REPORT: 'year-report',
  /** A letter, transcript or testimonial. */
  DOCUMENT: 'document',
} as const;

/*
  There is deliberately no whole-class job. The dashboard already assembles a
  class pack in the browser by asking for each card and zipping them, and with
  each of those now queued the pack gets real progress and the same
  concurrency cap for free. A second server-side path doing the same work
  would be a second thing to keep correct.
*/

export type RenderJobName = (typeof RenderJob)[keyof typeof RenderJob];

/**
 * How many pages may render at once, per worker process.
 *
 * Not a number picked for speed. Each concurrent render is a Chrome page with
 * its own compositor, and the memory is what runs out first: past a handful
 * the box starts swapping and every render gets slower, including the ones
 * already in flight. Two is the safe default for a small server, and it is
 * lifted per deployment rather than guessed at here.
 */
export const RENDER_CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 2);

/**
 * How long a finished result stays fetchable.
 *
 * Long enough for a slow connection to come back for it, short enough that a
 * term's worth of PDFs is not sitting in Redis. The client is told the id the
 * moment the job is accepted, so this clock starts when the render finishes,
 * not when it was asked for.
 */
export const RESULT_TTL_SECONDS = Number(
  process.env.RENDER_RESULT_TTL || 60 * 30,
);

/** What a caller is told while they wait. */
export interface RenderStatus {
  id: string;
  state: 'queued' | 'working' | 'done' | 'failed';
  /** 0 to 100. Meaningful for a class pack, 0 or 100 for a single card. */
  progress: number;
  /** Set once the render has finished. */
  filename?: string;
  /** Set when it failed, in words a person can act on. */
  error?: string;
}
