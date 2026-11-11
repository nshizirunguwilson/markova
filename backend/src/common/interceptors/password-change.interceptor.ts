import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { BEFORE_PASSWORD_CHANGE_KEY } from '../decorators/before-password-change.decorator';

/** What the web and mobile apps look for to send somebody to the change. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * A temporary password opens the password change and nothing else.
 *
 * The school sets a temporary password when it adds somebody or resets their
 * login, and the account is flagged to change it. Only the screen enforced
 * that: with the temporary password the whole API answered, profile, clinic
 * visits and the user list included. A temporary password has been read out
 * at a desk or sent by text, so until it is changed it is not proof of who
 * is asking.
 *
 * Runs on every request after sign in is checked, like
 * FormerStudentInterceptor, so a route that skips the role guard is still
 * covered. The flag is read fresh from the database on each request by the
 * JWT strategy, so the block lifts the moment the password changes.
 */
@Injectable()
export class PasswordChangeInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest().user as
      { forcePasswordChange?: boolean } | undefined;
    if (user?.forcePasswordChange) {
      const open = this.reflector.getAllAndOverride<boolean>(
        BEFORE_PASSWORD_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!open) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Change your temporary password before going on.',
          reason: PASSWORD_CHANGE_REQUIRED,
        });
      }
    }
    return next.handle();
  }
}
