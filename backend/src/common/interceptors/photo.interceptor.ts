import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { withSchool } from '../../prisma/request-context';
import {
  heldToInApp,
  keptOutOfApp,
  peopleWithPhotos,
  withoutPhotos,
} from '../photo-consent';

/**
 * Takes out of every reply to a student or a parent the photo of any student
 * whose family said No to the app (B6). Their own photo, and a parent's own
 * children, always stay.
 *
 * One place rather than each query: a photo travels with every person the API
 * names, and a rule some routes skip is not a rule. The staff are not held to
 * it, so their replies pass through untouched.
 */
@Injectable()
export class PhotoInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest().user as
      { id?: string; role?: string; schoolId?: string } | undefined;
    if (!user?.id || !user.schoolId || !heldToInApp(user.role)) {
      return next.handle();
    }
    return next
      .handle()
      .pipe(mergeMap((body) => from(this.strip(body, user as Viewer))));
  }

  private async strip(body: unknown, viewer: Viewer) {
    const people = peopleWithPhotos(body);
    people.delete(viewer.id);
    if (people.size === 0) return body;
    const hidden = await withSchool(viewer.schoolId, async () => {
      const kept = await keptOutOfApp(this.prisma, people);
      if (kept.size && viewer.role === 'PARENT') {
        const own = await this.prisma.parentStudent.findMany({
          where: { parentUserId: viewer.id },
          select: { student: { select: { userId: true } } },
        });
        for (const o of own) kept.delete(o.student.userId);
      }
      return kept;
    });
    return withoutPhotos(body, hidden);
  }
}

type Viewer = { id: string; role: string; schoolId: string };
