import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { currentRequest } from './request-context';

/**
 * The database client, and the place the request's identity is handed to it.
 *
 * Row level security in Postgres decides what a query may see from two session
 * settings, `app.role` and `app.user_id`. Postgres only sees a connection, so
 * something has to put the signed-in user there before the query runs. This
 * extension does it, on every query, from the async context the interceptor
 * established.
 *
 * ── Why every query and not once per connection ─────────────────────────────
 *
 * Connections are pooled and reused across requests, and behind pgbouncer in
 * transaction mode a connection is handed to somebody else between statements.
 * Setting the identity once at connect time would mean a query running under
 * whichever user last happened to use that connection, which is the exact leak
 * this exists to prevent.
 *
 * `set_config(..., true)` makes it local to the transaction, so it is
 * discarded when the transaction ends rather than leaking to the next borrower
 * of the connection.
 *
 * ── When there is no context ────────────────────────────────────────────────
 *
 * The seed, scheduled tasks and the render worker run outside any request.
 * They set nothing, and the policies read a missing setting as unrestricted.
 * Those processes are trusted; a web request always has an identity, because
 * the interceptor runs before the handler.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();

    /*
      Extends the client rather than wrapping it, so every call site gets this
      without knowing about it. A service that forgot to opt in would be a
      service reading rows it should not, which is the failure this is here to
      make impossible rather than merely unlikely.
    */
    return this.$extends({
      query: {
        async $allOperations({ args, query }) {
          const ctx = currentRequest();
          if (!ctx) return query(args);

          /*
            The identity and the query in one transaction, so they cannot be
            separated by the pool. Outside a transaction the setting could land
            on one connection and the query run on another.
          */
          return (this as unknown as PrismaService).$transaction(
            async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.role', ${ctx.role}, true)`;
              await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
              return query(args);
            },
          );
        },
      },
    }) as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
