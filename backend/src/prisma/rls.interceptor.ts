import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { withRequestContext } from './request-context';

/**
 * Tells the database who is asking, for the length of one request.
 *
 * Row level security needs an identity, and the database only ever sees a
 * connection. This puts the authenticated user into an async context that the
 * Prisma client reads when it runs a query, so no service signature has to
 * carry it.
 *
 * Runs after the auth guard, so `request.user` is populated. A request with no
 * user (the login route, the public admissions form, a health check) gets no
 * context, which the policies treat as unrestricted: those routes reach no
 * student data, and the ones that do have their own guards.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user?.id || !user?.role) return next.handle();

    return withRequestContext({ userId: user.id, role: user.role }, () =>
      next.handle(),
    );
  }
}
