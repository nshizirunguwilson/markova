import { ForbiddenException } from '@nestjs/common';
import { assertOnSide, sideOf } from './boarding-side';

describe('boarding sides', () => {
  const prisma = (gender: 'MALE' | 'FEMALE' | null | undefined) =>
    ({
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue(gender === undefined ? null : { gender }),
      },
    }) as any;

  it('puts the patron with the boys and the matron with the girls', () => {
    expect(sideOf('PATRON')).toBe('MALE');
    expect(sideOf('MATRON')).toBe('FEMALE');
    expect(sideOf('ADMIN')).toBeNull();
    expect(sideOf('TEACHER')).toBeNull();
  });

  it('lets each serve their own side', async () => {
    await expect(
      assertOnSide(prisma('MALE'), 'PATRON', 's-1'),
    ).resolves.toBeUndefined();
    await expect(
      assertOnSide(prisma('FEMALE'), 'MATRON', 's-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses each the other side, and says who to ask', async () => {
    await expect(
      assertOnSide(prisma('FEMALE'), 'PATRON', 's-1'),
    ).rejects.toThrow('The matron looks after this student');
    await expect(assertOnSide(prisma('MALE'), 'MATRON', 's-1')).rejects.toThrow(
      'The patron looks after this student',
    );
  });

  it('does not refuse a child with no gender recorded', async () => {
    await expect(
      assertOnSide(prisma(null), 'PATRON', 's-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses a student who does not exist', async () => {
    await expect(
      assertOnSide(prisma(undefined), 'MATRON', 'nobody'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('asks nothing of anybody not on a side', async () => {
    const p = prisma('FEMALE');
    await assertOnSide(p, 'ADMIN', 's-1');
    expect(p.student.findFirst).not.toHaveBeenCalled();
  });
});
