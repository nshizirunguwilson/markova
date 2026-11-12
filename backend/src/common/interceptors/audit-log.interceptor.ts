import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { withPlatform } from '../../prisma/request-context';
import { Observable, tap } from 'rxjs';
import { redact } from '../redaction';
import { PrismaService } from '../../prisma/prisma.service';

/*
  What is deliberately not written down.

  Every change to school records is logged. These are left out because an
  entry would say nothing about anybody's record:
  - the sign-in machinery, where nobody is signed in yet and the body is
    credentials (sessions carry their own trail);
  - the public admissions endpoints, open to the internet and throttled, and
    the application itself keeps its own event trail;
  - read receipts, which record that somebody looked, not that anything
    changed, and fire on every chat or bell opened.
*/
const SKIPPED_PATHS = [
  'auth/login',
  'auth/verify-otp',
  'auth/resend-otp',
  'auth/refresh',
  'auth/request-reset',
  'auth/reset-password',
  'admissions/public',
  'messaging/read',
  'notifications/read-all',
  'notifications/:id/read',
];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only log mutating requests
    if (['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return next.handle();
    }

    /*
      Every other write is logged. It used to be only marks, attendance,
      discipline and users, so a payment, a waiver, a clinic visit or a
      pocket money entry left no trace of who made it, while the SOS deck
      promises every action is recorded against the person who took it.
    */
    const urlPath: string = request.route?.path || request.url || '';
    const normalized = urlPath.replace(/^\/?api\//, '/').replace(/^\//, '');
    if (SKIPPED_PATHS.some((p) => normalized.startsWith(p))) {
      return next.handle();
    }

    const user = request.user;
    const action = method;
    const entity = this.extractEntity(urlPath);
    const ipAddress = request.ip || request.socket?.remoteAddress;

    // Summarise request body (strip sensitive fields, limit size)
    const details = this.summariseBody(request.body);

    return next.handle().pipe(
      tap((response) => {
        const entityId =
          request.params?.id ||
          (response as Record<string, unknown>)?.['id'] ||
          null;

        /*
          Written with the school named outright, as platform work. By the
          time this runs the request's own school context may be gone, and
          an entry that silently failed the wall between schools would be a
          change nobody could trace. An entry with no signed-in person has no
          school, which is what a platform event is.
        */
        void withPlatform(() =>
          this.prisma.auditLog.create({
            data: {
              schoolId: user?.schoolId ?? null,
              userId: user?.id || null,
              action,
              entityType: entity,
              entityId: entityId ? String(entityId) : null,
              newValue: details,
              ipAddress: ipAddress || null,
            },
          }),
        ).catch((error) => {
          this.logger.warn('Failed to write audit log', error);
        });
      }),
    );
  }

  /**
   * What the entry is about, read from the route itself.
   *
   * The first two fixed segments of the path, so /api/finance/payments is
   * "finance/payments" and /api/students/:id/journey/suspend is
   * "students/journey": specific enough to filter by, without an id in it.
   */
  private extractEntity(urlPath: string): string {
    const statics = urlPath
      .replace(/^\/?api\//, '/')
      .split('/')
      // route params when the pattern is known, raw ids when it is not
      .filter((seg) => seg && !seg.startsWith(':') && !/[\d]/.test(seg));
    return statics.slice(0, 2).join('/') || 'unknown';
  }

  private summariseBody(body: unknown): string | null {
    if (!body || typeof body !== 'object') {
      return null;
    }

    /*
      The shared list rather than a local one, and it now covers more than
      credentials. This table records clinic visits and discipline entries, so
      the old list wrote a child's diagnosis into the audit row in full. It
      also only looked at the top level, and a clinic visit arrives nested.
    */
    const json = JSON.stringify(redact(body));
    // Cap at 2KB to avoid bloating the audit table
    return json.length > 2048 ? json.slice(0, 2048) + '...' : json;
  }
}
