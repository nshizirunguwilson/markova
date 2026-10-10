import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who the current request belongs to, available anywhere without passing it.
 *
 * Row level security needs the database to know who is asking, and the
 * database only sees a connection. This carries the answer from the guard that
 * authenticated the request down to the query that runs, without threading a
 * user id through every service signature in the codebase.
 *
 * `AsyncLocalStorage` rather than a module-level variable, and that is the
 * whole point: Node serves many requests concurrently on one thread, so a
 * shared variable would be whichever request wrote to it last. This keeps one
 * value per async call chain.
 *
 * There are three kinds of context, and the difference is the wall between
 * schools (docs/MULTI-SCHOOL-DESIGN.md):
 *
 *   a person      userId, role and schoolId: an authenticated request
 *   a school      schoolId alone: work done for one school with nobody signed
 *                 in, such as a scheduled reminder or a queued PDF
 *   the platform  platform: true: work that has to look across schools, such
 *                 as finding who is signing in. Every use is deliberate and
 *                 named, and it can never come from a request's own data.
 *
 * No context at all is a real answer too, and it means nothing: the database
 * shows no school's rows to a query that has not said which school it is for.
 */
export interface RequestContext {
  userId?: string;
  role?: string;
  schoolId?: string;
  platform?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with this request's identity attached to everything inside it. */
export const withRequestContext = <T>(
  context: RequestContext,
  fn: () => T,
): T => storage.run(context, fn);

/*
  Both helpers below await `fn` inside the context, and that is not cosmetic.
  A Prisma query is lazy: it runs when it is awaited, not when it is written.
  `withPlatform(() => prisma.user.findUnique(...))` would otherwise build the
  query inside the context and run it outside, with no school and no bypass,
  and the database would quietly return nothing.
*/

/**
 * Run `fn` inside one school, with nobody signed in.
 *
 * For scheduled tasks, queued jobs and public pages that have already worked
 * out which school they serve.
 */
export const withSchool = <T>(
  schoolId: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> => storage.run({ schoolId }, async () => await fn());

/**
 * Run `fn` above the wall between schools.
 *
 * Only for work that genuinely has to look across schools before it can know
 * which school it belongs to: finding the person who is signing in, or the
 * record a public verification code points at. Keep what runs inside as small
 * as possible, and move into the school as soon as it is known.
 */
export const withPlatform = <T>(fn: () => T | PromiseLike<T>): Promise<T> =>
  storage.run({ platform: true }, async () => await fn());

/**
 * The current request's identity, or null.
 *
 * Null means no context was set, and the database will show nothing.
 */
export const currentRequest = (): RequestContext | null =>
  storage.getStore() ?? null;

/**
 * Whether the identity has already been put on the connection in hand.
 *
 * The settings the policies read are transaction local, so they have to be set
 * inside the same transaction as the query that depends on them. A standalone
 * query gets a transaction of its own for the purpose. A query running inside
 * one a service opened must not: it is already on a connection that has been
 * told who is asking, and opening another would take a second connection,
 * leave the outer transaction's work unprotected by the setting, and quietly
 * break the atomicity the service asked for.
 *
 * This flag is what tells the two cases apart.
 */
const applied = new AsyncLocalStorage<true>();

/** Run `fn` knowing the connection it uses already carries the identity. */
export const withIdentityApplied = <T>(fn: () => T): T => applied.run(true, fn);

/** True when the caller is already inside a transaction that set the identity. */
export const identityApplied = (): boolean => applied.getStore() === true;
