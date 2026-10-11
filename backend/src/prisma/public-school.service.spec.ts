import { BadRequestException } from '@nestjs/common';

import { PublicSchoolService } from './public-school.service';

/** Which school a page with nobody signed in belongs to. */
describe('PublicSchoolService', () => {
  const build = (defaultSchool?: string, active = [{ id: 'only' }]) => {
    const prisma = {
      school: {
        findFirst: jest.fn(({ where }: { where: { slug: string } }) =>
          Promise.resolve(
            ['markova-academy', 'gs-umucyo'].includes(where.slug)
              ? { id: `id-${where.slug}` }
              : null,
          ),
        ),
        findMany: jest.fn().mockResolvedValue(active),
      },
    };
    const config = { get: jest.fn(() => defaultSchool) };
    return new PublicSchoolService(prisma as never, config as never);
  };
  const ask = (headers: Record<string, string> = {}) => ({ headers });

  it('takes the school the client names', async () => {
    await expect(
      build('markova-academy').resolve(ask({ 'x-school': 'gs-umucyo' })),
    ).resolves.toBe('id-gs-umucyo');
  });

  it("falls back to the install's own school", async () => {
    const twoSchools = [{ id: 'a' }, { id: 'b' }];
    await expect(
      build('markova-academy', twoSchools).resolve(ask()),
    ).resolves.toBe('id-markova-academy');
  });

  it('finds the only school when nothing is named', async () => {
    await expect(build().resolve(ask())).resolves.toBe('only');
  });

  it('refuses to guess between several', async () => {
    await expect(
      build(undefined, [{ id: 'a' }, { id: 'b' }]).resolve(ask()),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a school that is not there or not active', async () => {
    await expect(
      build().resolve(ask({ 'x-school': 'nowhere' })),
    ).rejects.toThrow('No such school');
  });
});
