import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { PrismaService } from './prisma.service';

/**
 * Which school a page with nobody signed in is for.
 *
 * The sign in screen's branding and the public admissions form both belong to
 * one school, but there is no signed-in person to say which. Until each school
 * has its own address (step 4), the answer comes from:
 *
 *   1. the `X-School` header, carrying the school's slug, when the client
 *      knows it (the web app sends the signed-in person's school);
 *   2. `DEFAULT_SCHOOL`, the slug of the school this install's public pages
 *      belong to, when it is set; or
 *   3. the only active school, when there is exactly one. A school running its
 *      own copy of Markova never has to say.
 *
 * With several schools and no header, it refuses rather than picking one: a
 * guess would show one school's name, or take one school's application, on
 * another school's page.
 */
@Injectable()
export class PublicSchoolService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async resolve(request: Pick<Request, 'headers'>): Promise<string> {
    const header = request.headers['x-school'];
    const slug =
      (Array.isArray(header) ? header[0] : header)?.trim() ||
      this.config?.get<string>('DEFAULT_SCHOOL')?.trim();

    if (slug) {
      const school = await this.prisma.school.findFirst({
        where: { slug: slug.toLowerCase(), status: 'ACTIVE' },
        select: { id: true },
      });
      if (!school) throw new BadRequestException('No such school');
      return school.id;
    }

    const active = await this.prisma.school.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      take: 2,
    });
    if (active.length === 1) return active[0].id;
    throw new BadRequestException(
      'Say which school this is for, with the X-School header',
    );
  }
}
