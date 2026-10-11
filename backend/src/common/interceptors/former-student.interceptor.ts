import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { FORMER_STUDENTS_KEY } from '../decorators/former-students.decorator';
import { whatStops } from '../student-standing';

/**
 * A student who has left sees their own past, and nothing else.
 *
 * Runs on every request after sign in is checked, rather than in the role
 * guard, because not every route uses the role guard and a check that some
 * routes skip is not a check. A student who passed away never gets this far:
 * their account is closed, so sign in refuses them.
 */
@Injectable()
export class FormerStudentInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest().user as
      { role?: string; studentStatus?: string | null } | undefined;
    if (
      user?.role === 'STUDENT' &&
      user.studentStatus &&
      whatStops(user.studentStatus as never).signIn !== 'full'
    ) {
      const open = this.reflector.getAllAndOverride<boolean>(
        FORMER_STUDENTS_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!open) {
        throw new ForbiddenException(
          'You have left the school. You can still open your report cards.',
        );
      }
    }
    return next.handle();
  }
}
