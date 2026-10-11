import { PauseKind, StudentStatus } from '@prisma/client';
import {
  asDay,
  dayBefore,
  familyMayHear,
  pausesOn,
  schoolDay,
  untilWords,
  whatStops,
} from './student-standing';

/**
 * What a student's standing means: the table in docs/STUDENT-LIFE-DESIGN.md,
 * one test per row, so a change to any cell is a change somebody meant.
 */
describe('what a standing stops', () => {
  const active = whatStops(StudentStatus.ACTIVE);
  const suspended = whatStops(StudentStatus.ACTIVE, PauseKind.SUSPENDED);
  const away = whatStops(StudentStatus.ACTIVE, PauseKind.AWAY);
  const left = [
    StudentStatus.WITHDRAWN,
    StudentStatus.EXPELLED,
    StudentStatus.TRANSFERRED,
    StudentStatus.GRADUATED,
  ].map((s) => whatStops(s));
  const passedAway = whatStops(StudentStatus.PASSED_AWAY);

  it('stops nothing for a student in school', () => {
    expect(active).toEqual({
      onRegister: true,
      takesAttendance: true,
      family: {
        absence: true,
        conduct: true,
        health: true,
        news: true,
        debt: true,
      },
      newInvoices: true,
      classChat: 'member',
      signIn: 'full',
      card: 'valid',
    });
  });

  it('keeps a paused student on the register, marked neither present nor absent', () => {
    for (const s of [suspended, away]) {
      expect(s.onRegister).toBe(true);
      expect(s.takesAttendance).toBe(false);
    }
  });

  it('never texts the family of a paused student that they were absent', () => {
    expect(suspended.family.absence).toBe(false);
    expect(away.family.absence).toBe(false);
  });

  it('still tells the family of a paused student about school life', () => {
    expect(suspended.family.news).toBe(true);
    expect(away.family.news).toBe(true);
  });

  it('keeps invoicing a paused student; the school decides about refunds', () => {
    expect(suspended.newInvoices).toBe(true);
    expect(away.newInvoices).toBe(true);
  });

  it('lets a suspended student read the class chat but not post', () => {
    expect(suspended.classChat).toBe('read-only');
    expect(away.classChat).toBe('member');
  });

  it('lets a suspended student sign in, to keep up with homework', () => {
    expect(suspended.signIn).toBe('full');
  });

  it('suspends the card of a suspended student only', () => {
    expect(suspended.card).toBe('suspended');
    expect(away.card).toBe('valid');
  });

  it('takes a student who left off everything but their records', () => {
    for (const s of left) {
      expect(s.onRegister).toBe(false);
      expect(s.family.absence).toBe(false);
      expect(s.family.news).toBe(false);
      expect(s.newInvoices).toBe(false);
      expect(s.classChat).toBe('removed');
      expect(s.signIn).toBe('records-only');
      expect(s.card).toBe('revoked');
    }
  });

  it('still lets the family of a student who left be told about a book owed', () => {
    for (const s of left) expect(s.family.debt).toBe(true);
  });

  it('never writes to the family of a student who passed away, about anything', () => {
    expect(passedAway.family).toEqual({
      absence: false,
      conduct: false,
      health: false,
      news: false,
      debt: false,
    });
    expect(passedAway.signIn).toBe('none');
    expect(passedAway.onRegister).toBe(false);
    expect(passedAway.newInvoices).toBe(false);
  });
});

describe('days', () => {
  it('is the date in Kigali, not in London', () => {
    // 23:30 UTC on the 12th is already 01:30 on the 13th in Kigali.
    expect(schoolDay(new Date('2026-10-12T23:30:00Z')).toISOString()).toBe(
      '2026-10-13T00:00:00.000Z',
    );
    expect(schoolDay(new Date('2026-10-12T21:30:00Z')).toISOString()).toBe(
      '2026-10-12T00:00:00.000Z',
    );
  });

  it('reads a date or a full time as its day', () => {
    expect(asDay('2026-10-20').toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(asDay('2026-10-20T15:00:00Z').toISOString()).toBe(
      '2026-10-20T00:00:00.000Z',
    );
  });

  it('finds the day before', () => {
    expect(dayBefore(asDay('2026-11-01')).toISOString()).toBe(
      '2026-10-31T00:00:00.000Z',
    );
  });

  it('says until when, or nothing', () => {
    expect(untilWords(asDay('2026-10-20'))).toBe('until 20 October');
    expect(untilWords(null)).toBe('');
  });
});

describe('who is paused on a day', () => {
  const db = (rows: any[]) => ({
    studentPause: { findMany: jest.fn().mockResolvedValue(rows) },
    student: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
  });

  it('asks only about the pauses covering that day', async () => {
    const reader = db([]);
    const day = asDay('2026-10-14');
    await pausesOn(reader, ['s1'], day);
    const where = reader.studentPause.findMany.mock.calls[0][0].where;
    expect(where.startsOn).toEqual({ lte: day });
    expect(where.OR).toEqual([{ endsOn: null }, { endsOn: { gte: day } }]);
  });

  it('asks nothing for nobody', async () => {
    const reader = db([]);
    expect((await pausesOn(reader, [], asDay('2026-10-14'))).size).toBe(0);
    expect(reader.studentPause.findMany).not.toHaveBeenCalled();
  });

  it('lets a suspension win over time away on the same day', async () => {
    const reader = db([
      {
        studentId: 's1',
        kind: 'SUSPENDED',
        startsOn: 1,
        endsOn: 2,
        reason: 'a',
      },
      { studentId: 's1', kind: 'AWAY', startsOn: 1, endsOn: null, reason: 'b' },
    ]);
    const found = await pausesOn(reader, ['s1'], asDay('2026-10-14'));
    expect(found.get('s1')?.kind).toBe('SUSPENDED');
  });

  it('tells the family of a student in school, and not of one suspended that day', async () => {
    expect(await familyMayHear(db([]), 's1', 'absence')).toBe(true);
    const suspendedToday = db([
      {
        studentId: 's1',
        kind: 'SUSPENDED',
        startsOn: 1,
        endsOn: 2,
        reason: 'a',
      },
    ]);
    expect(await familyMayHear(suspendedToday, 's1', 'absence')).toBe(false);
    expect(await familyMayHear(suspendedToday, 's1', 'news')).toBe(true);
  });

  it('tells nobody about a student who is not there', async () => {
    const reader = db([]);
    reader.student.findUnique.mockResolvedValue(null);
    expect(await familyMayHear(reader, 'nobody', 'news')).toBe(false);
  });
});

/** An adult child decides what their parents hear (A8). */
describe('what an adult student lets their family hear', () => {
  const db = (sharing: Record<string, boolean>) => ({
    studentPause: { findMany: jest.fn().mockResolvedValue([]) },
    student: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        dateOfBirth: asDay('2000-01-01'),
        sharesResults: true,
        sharesConduct: true,
        sharesHealth: true,
        ...sharing,
      }),
    },
  });

  it('sends no absence text or conduct notice when attendance and discipline are private', async () => {
    const reader = db({ sharesConduct: false });
    expect(await familyMayHear(reader as never, 's1', 'absence')).toBe(false);
    expect(await familyMayHear(reader as never, 's1', 'conduct')).toBe(false);
    expect(await familyMayHear(reader as never, 's1', 'news')).toBe(true);
  });

  it('sends no health notice when health is private', async () => {
    const reader = db({ sharesHealth: false });
    expect(await familyMayHear(reader as never, 's1', 'health')).toBe(false);
    expect(await familyMayHear(reader as never, 's1', 'absence')).toBe(true);
  });
});
