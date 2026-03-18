import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return next.handle();
    }

    const user = request.user;
    const action = `${method} ${request.route?.path || request.url}`;

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              userId: user?.id || null,
              action,
              entityType: context.getClass().name,
              entityId: request.params?.id || null,
              newValue: response ? JSON.stringify(response) : null,
              ipAddress: request.ip,
            },
          });
        } catch {
          // Don't let audit logging failures break the request
        }
      }),
    );
  }
}
