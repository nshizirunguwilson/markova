import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

const SENSITIVE_PATHS = ['marks', 'attendance', 'discipline', 'users'];

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

    // Only log requests to sensitive resource paths
    const urlPath: string = request.route?.path || request.url || '';
    const isSensitive = SENSITIVE_PATHS.some((p) => urlPath.includes(p));
    if (!isSensitive) {
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

        void this.prisma.auditLog
          .create({
            data: {
              userId: user?.id || null,
              action,
              entityType: entity,
              entityId: entityId ? String(entityId) : null,
              newValue: details,
              ipAddress: ipAddress || null,
            },
          })
          .catch((error) => {
            this.logger.warn('Failed to write audit log', error);
          });
      }),
    );
  }

  private extractEntity(urlPath: string): string {
    // Extract the first matching sensitive segment from the path
    // e.g. /api/marks/123 -> marks, /api/users/abc/attendance -> attendance
    const segments = urlPath.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      // Strip route params like :id
      const clean = segments[i].replace(/^:/, '');
      if (SENSITIVE_PATHS.includes(clean)) {
        return clean;
      }
    }
    return segments[segments.length - 1] || 'unknown';
  }

  private summariseBody(body: unknown): string | null {
    if (!body || typeof body !== 'object') {
      return null;
    }

    // Omit passwords and tokens from audit details
    const sanitised = { ...(body as Record<string, unknown>) };
    const redactKeys = ['password', 'token', 'otp', 'secret', 'refreshToken'];
    for (const key of redactKeys) {
      if (key in sanitised) {
        sanitised[key] = '[REDACTED]';
      }
    }

    const json = JSON.stringify(sanitised);
    // Cap at 2KB to avoid bloating the audit table
    return json.length > 2048 ? json.slice(0, 2048) + '...' : json;
  }
}
