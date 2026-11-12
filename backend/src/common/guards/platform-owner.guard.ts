import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Routes that belong to whoever runs Markova itself, not to any school.
 *
 * The platform role lives on the account (`Account.platformRole`), not on a
 * school record: inside a school the owner is only whatever their record
 * there says, like anybody else. The JWT strategy copies it onto the
 * request's user on every request, so this reads a value the database just
 * confirmed, not a claim in the token.
 */
@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest()?.user;
    if (user?.platformRole !== 'OWNER') {
      throw new ForbiddenException('Only the owner of Markova can do this');
    }
    return true;
  }
}
