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
 */
export interface RequestContext {
  userId: string;
  role: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with this request's identity attached to everything inside it. */
export const withRequestContext = <T>(
  context: RequestContext,
  fn: () => T,
): T => storage.run(context, fn);

/**
 * The current request's identity, or null.
 *
 * Null is a real answer, not a failure: seeds, scheduled tasks and the render
 * worker all run outside any request. They connect as the owning role, which
 * the policies do not restrict, so they are unaffected.
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
