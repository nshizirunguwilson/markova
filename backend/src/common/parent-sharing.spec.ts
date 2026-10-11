import { ForbiddenException } from '@nestjs/common';
import {
  KeptPrivateException,
  assertParentMaySee,
  isAdult,
  keptFromParents,
  parentKept,
} from './parent-sharing';
import { asDay } from './student-standing';

/**
 * What a parent may see of a child who is an adult (A8): the student decides,
 * from their 18th birthday, and nothing changes until they do.
 */
describe('a student turning 18', () => {
  const today = asDay('2026-10-12');

  it('is an adult from the day itself', () => {
    expect(isAdult(asDay('2008-10-12'), today)).toBe(true);
    expect(isAdult(asDay('2008-10-13'), today)).toBe(false);
    expect(isAdult(asDay('1999-01-01'), today)).toBe(true);
  });

  it('counts a 29 February birthday from 1 March in an ordinary year', () => {
    expect(isAdult(asDay('2008-02-29'), asDay('2026-02-28'))).toBe(false);
    expect(isAdult(asDay('2008-02-29'), asDay('2026-03-01'))).toBe(true);
  });

  it('treats a student with no date of birth as under 18', () => {
    expect(isAdult(null, today)).toBe(false);
    expect(isAdult(undefined, today)).toBe(false);
  });
});

describe('what is kept from parents', () => {
  const today = asDay('2026-10-12');
  const student = (over: Record<string, unknown> = {}) => ({
    dateOfBirth: asDay('2007-01-01'),
    sharesResults: true,
    sharesConduct: true,
    sharesHealth: true,
    ...over,
  });

  it('keeps nothing until the student chooses', () => {
    for (const kind of ['results', 'conduct', 'health'] as const) {
      expect(keptFromParents(student(), kind, today)).toBe(false);
    }
  });

  it('keeps only what an adult turned off', () => {
    const s = student({ sharesHealth: false });
    expect(keptFromParents(s, 'health', today)).toBe(true);
    expect(keptFromParents(s, 'results', today)).toBe(false);
    expect(keptFromParents(s, 'conduct', today)).toBe(false);
  });

  it('keeps nothing from the parents of a child under 18, whatever is stored', () => {
    const s = student({
      dateOfBirth: asDay('2010-01-01'),
      sharesResults: false,
      sharesConduct: false,
      sharesHealth: false,
    });
    for (const kind of ['results', 'conduct', 'health'] as const) {
      expect(keptFromParents(s, kind, today)).toBe(false);
    }
  });
});

describe('refusing a parent', () => {
  const db = (row: unknown) => ({
    student: { findUnique: jest.fn().mockResolvedValue(row) },
  });
  const adult = {
    dateOfBirth: asDay('2000-01-01'),
    sharesResults: false,
    sharesConduct: true,
    sharesHealth: true,
    user: { firstName: 'Keza' },
  };

  it('says calmly what is private, with a reason the app can show', async () => {
    const refused = assertParentMaySee(db(adult), 's1', 'results');
    await expect(refused).rejects.toThrow(KeptPrivateException);
    await expect(refused).rejects.toThrow(ForbiddenException);
    const error = await assertParentMaySee(
      db(adult) as never,
      's1',
      'results',
    ).catch((e: KeptPrivateException) => e);
    expect((error as KeptPrivateException).getResponse()).toMatchObject({
      reason: 'KEPT_PRIVATE',
      detail: { sharing: 'results' },
      message:
        'Keza has chosen to keep their results (marks and report cards) private.',
    });
  });

  it('lets through what is shared, and a student who is not there', async () => {
    await expect(
      assertParentMaySee(db(adult) as never, 's1', 'health'),
    ).resolves.toBeUndefined();
    await expect(
      assertParentMaySee(db(null) as never, 's1', 'results'),
    ).resolves.toBeUndefined();
  });

  it('answers yes or no for pages that only leave a part out', async () => {
    expect(await parentKept(db(adult) as never, 's1', 'results')).toBe(true);
    expect(await parentKept(db(adult) as never, 's1', 'conduct')).toBe(false);
    expect(await parentKept(db(null) as never, 's1', 'conduct')).toBe(false);
  });
});
