import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

import {
  currentRequest,
  identityApplied,
  withIdentityApplied,
  type RequestContext,
} from './request-context';

/**
 * The database client, and the place the request's identity is handed to it.
 *
 * Row level security in Postgres decides what a query may see from two session
 * settings, `app.role` and `app.user_id`. Postgres only sees a connection, so
 * something has to put the signed-in user there before the query runs. This
 * extension does it, from the async context the interceptor established, so no
 * service signature has to carry it and no service can forget to.
 *
 * ── Why not once per connection ─────────────────────────────────────────────
 *
 * Connections are pooled and reused across requests, and behind pgbouncer in
 * transaction mode a connection is handed to somebody else between statements.
 * Setting the identity once at connect time would mean a query running under
 * whichever user last happened to use that connection, which is the exact leak
 * this exists to prevent. `set_config(..., TRUE)` is transaction local: it is
 * discarded when the transaction ends rather than following the connection to
 * its next borrower.
 *
 * ── Which means every query needs a transaction ─────────────────────────────
 *
 * A setting that dies with the transaction is no use to a query outside one, so
 * a standalone query is sent as a batch of three: set the role, set the user,
 * run the query. Prisma runs a batch in one transaction on one connection,
 * which is the whole requirement.
 *
 * A query inside a transaction a service opened is the opposite case. That
 * connection has already been told who is asking, by the `$transaction` below,
 * and giving it a second transaction would take a second connection, leave the
 * outer transaction's other statements running without the setting, and break
 * the atomicity the service opened a transaction to get. `identityApplied()`
 * is how the two are told apart.
 *
 * ── When there is no context ────────────────────────────────────────────────
 *
 * The seed, scheduled tasks and the render worker run outside any request.
 * They set nothing, and the policies read a missing setting as unrestricted.
 * Those processes are trusted; a web request always has an identity, because
 * the interceptor runs after the guard and before the handler.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();

    /*
      The client as it was before the extension. Every statement this file
      issues itself goes through here rather than through `this`, because a
      `set_config` sent through the extension would be a query needing a
      transaction needing a `set_config`, without end.

      It is also the only honest way to reach `$transaction`. Inside an
      extension callback `this` is the extension's own context and has no
      client methods on it at all, which is what the first version of this
      file got wrong: it threw `$transaction is not a function` on every
      authenticated request, and only in a deployment, because the tests
      construct services with a stub client and never run the extension.
    */
    const base = this as PrismaClient;

    const identify = (ctx: RequestContext) => [
      base.$executeRaw`SELECT set_config('app.role', ${ctx.role}, TRUE)`,
      base.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, TRUE)`,
    ];

    return this.$extends({
      client: {
        /*
          Interactive transactions, taken over so the identity is set once, at
          the start, on the connection the whole callback will use. Everything
          inside then runs under `withIdentityApplied` and passes straight
          through the query extension below.
        */
        $transaction(...args: unknown[]) {
          const ctx = currentRequest();
          const [first, options] = args;

          if (!ctx || typeof first !== 'function') {
            return (base.$transaction as (...a: unknown[]) => Promise<unknown>)(
              ...args,
            );
          }

          const run = first as (tx: unknown) => Promise<unknown>;
          return base.$transaction(
            async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.role', ${ctx.role}, TRUE)`;
              await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, TRUE)`;
              return withIdentityApplied(() => run(tx));
            },
            options as Parameters<typeof base.$transaction>[1],
          );
        },
      },
      query: {
        async $allOperations({ args, query }) {
          const ctx = currentRequest();
          if (!ctx || identityApplied()) return query(args);

          const [, , result] = await base.$transaction([
            ...identify(ctx),
            query(args) as Prisma.PrismaPromise<unknown>,
          ]);
          return result;
        },
      },
    }) as this;
  }

  /**
   * The school the current query runs in.
   *
   * Most code never needs this: a new row takes its school from the
   * connection, and reads will be limited to the current school for them.
   * It is for the few places that address a row by a value that is unique
   * only inside a school, such as a setting's key, where Prisma needs the
   * school as part of the key.
   *
   * It reads the connection's own `app.school_id`, so it always agrees with
   * the school a row written in the same request would get.
   */
  async currentSchoolId(): Promise<string> {
    const [row] = await this.$queryRaw<
      { id: string }[]
    >`SELECT current_setting('app.school_id') AS id`;
    return row.id;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
