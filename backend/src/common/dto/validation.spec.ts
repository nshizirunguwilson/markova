// The decorators on every DTO are read through Reflect. Nest's own
// bootstrap loads this; a spec that imports a DTO directly has to.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { PaginationDto } from './pagination.dto';
import { CreateMarkDto } from '../../modules/marks/dto';
import { MarkAttendanceDto, NfcScanDto } from '../../modules/attendance/dto';
import { CreateVisitDto, GiveMedicineDto } from '../../modules/clinic/dto';
import { AwardMeritDto } from '../../modules/discipline/dto';
import {
  LookupDto,
  MoneyMovementDto,
  ReverseTransactionDto,
} from '../../modules/pocket-money/dto';
import { BroadcastDto, SendMessageDto } from '../../modules/messaging/dto';
import { CreateActivityDto } from '../../modules/activities/dto';
import { QueryAnalyticsDto } from '../../modules/analytics/dto';
import { CreateBookDto } from '../../modules/library/dto';
import { CreateHomeworkDto } from '../../modules/homework/dto';
import { CreateUserDto } from '../../modules/users/dto/create-user.dto';
import { UpdateUserDto } from '../../modules/users/dto/update-user.dto';

/**
 * What the API refuses at the door.
 *
 * Every DTO is a declaration of the only fields a route accepts, enforced by a
 * global pipe with `whitelist` and `forbidNonWhitelisted`. That makes these
 * decorators the outermost guard in the system: a rule missing here is a bad
 * value reaching a service that assumed it could not.
 */

const errorsOn = (cls: any, value: unknown): string[] => {
  const instance: object = plainToInstance(cls, value, {
    enableImplicitConversion: true,
  });
  return validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((e) => e.property);
};

const accepts = (cls: any, value: unknown) => errorsOn(cls, value).length === 0;

const uuid = 'a0000000-0000-4000-8000-000000000001';

describe('paging', () => {
  it('defaults to the first page of twenty', () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('reads the numbers out of a query string', () => {
    const dto = plainToInstance(
      PaginationDto,
      { page: '3', limit: '50' },
      { enableImplicitConversion: true },
    );
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it('refuses a page before the first', () => {
    expect(errorsOn(PaginationDto, { page: 0 })).toContain('page');
  });

  // A page size of a thousand is somebody trying to pull the whole database
  // through an endpoint meant to hand out a screenful.
  it('refuses a page size big enough to pull a whole table', () => {
    expect(errorsOn(PaginationDto, { limit: 1000 })).toContain('limit');
  });

  it('refuses a page that is not a number at all', () => {
    expect(errorsOn(PaginationDto, { page: 'first' })).toContain('page');
  });
});

/**
 * A mark is the most consequential number a school publishes about a child.
 */
describe('a mark', () => {
  const valid = {
    studentId: uuid,
    subjectId: uuid,
    classSectionId: uuid,
    termId: uuid,
    assessmentTypeId: uuid,
    score: 17,
  };

  it('accepts a whole one', () => {
    expect(accepts(CreateMarkDto, valid)).toBe(true);
  });

  it('refuses a negative score', () => {
    expect(errorsOn(CreateMarkDto, { ...valid, score: -1 })).toContain('score');
  });

  it('refuses a student named by anything but an id', () => {
    expect(
      errorsOn(CreateMarkDto, { ...valid, studentId: 'Divine' }),
    ).toContain('studentId');
  });

  it('refuses a mark with no student at all', () => {
    expect(
      errorsOn(CreateMarkDto, { ...valid, studentId: undefined }),
    ).toContain('studentId');
  });

  // The pipe runs with `forbidNonWhitelisted`, so a field nobody declared is
  // refused rather than quietly dropped.
  it('refuses a field nobody declared', () => {
    expect(errorsOn(CreateMarkDto, { ...valid, teacherId: uuid })).toContain(
      'teacherId',
    );
  });
});

describe('a register entry', () => {
  const valid = {
    studentId: uuid,
    classSectionId: uuid,
    date: '2026-08-20',
    type: 'daily',
    status: 'PRESENT',
  };

  it('accepts a whole one', () => {
    expect(accepts(MarkAttendanceDto, valid)).toBe(true);
  });

  // A status outside the three the system knows would be stored and then
  // counted as neither present nor absent.
  it('refuses a status nobody recognises', () => {
    expect(
      errorsOn(MarkAttendanceDto, { ...valid, status: 'MAYBE' }),
    ).toContain('status');
  });

  it('refuses a date that is not a date', () => {
    expect(
      errorsOn(MarkAttendanceDto, { ...valid, date: 'yesterday' }),
    ).toContain('date');
  });

  it('accepts a scan carrying just a card and a class', () => {
    expect(
      accepts(NfcScanDto, {
        nfcCardId: '1111 2222 3333',
        classSectionId: uuid,
      }),
    ).toBe(true);
  });
});

/**
 * A temperature outside a survivable range is a typo, and a typo in a
 * temperature is dangerous.
 */
describe('a clinic visit', () => {
  const valid = { studentId: uuid, complaint: 'Headache since assembly' };

  it('accepts a complaint and nothing else', () => {
    expect(accepts(CreateVisitDto, valid)).toBe(true);
  });

  it('refuses a visit with no complaint', () => {
    expect(errorsOn(CreateVisitDto, { studentId: uuid })).toContain(
      'complaint',
    );
  });

  it.each([24, 46, 0, 100])('refuses a temperature of %s', (temperature) => {
    expect(errorsOn(CreateVisitDto, { ...valid, temperature })).toContain(
      'temperature',
    );
  });

  it.each([35, 36.6, 38.4, 41])(
    'accepts a temperature of %s',
    (temperature) => {
      expect(accepts(CreateVisitDto, { ...valid, temperature })).toBe(true);
    },
  );

  it('refuses an outcome nobody recognises', () => {
    expect(
      errorsOn(CreateVisitDto, { ...valid, outcome: 'SENT_TO_SPACE' }),
    ).toContain('outcome');
  });

  it('needs both the medicine and the dose', () => {
    expect(
      errorsOn(GiveMedicineDto, { studentId: uuid, medicine: 'Paracetamol' }),
    ).toContain('dose');
  });
});

/**
 * A merit worth thirty points would undo three serious incidents at once,
 * which is how a recognition system stops being taken seriously.
 */
describe('a merit', () => {
  const valid = {
    studentId: uuid,
    termId: uuid,
    category: 'HONESTY',
    description: 'Handed in a wallet she found',
    points: 10,
    date: '2026-08-20',
  };

  it('accepts a whole one', () => {
    expect(accepts(AwardMeritDto, valid)).toBe(true);
  });

  it('refuses more points than any single incident costs', () => {
    expect(errorsOn(AwardMeritDto, { ...valid, points: 30 })).toContain(
      'points',
    );
  });

  it('refuses a merit worth nothing', () => {
    expect(errorsOn(AwardMeritDto, { ...valid, points: 0 })).toContain(
      'points',
    );
  });

  it('refuses a category the school does not award', () => {
    expect(
      errorsOn(AwardMeritDto, { ...valid, category: 'BEING_TALL' }),
    ).toContain('category');
  });

  it('refuses a merit with nothing said about it', () => {
    expect(
      errorsOn(AwardMeritDto, { ...valid, description: undefined }),
    ).toContain('description');
  });
});

/**
 * Somebody else's child's money.
 */
describe('a money movement', () => {
  const valid = { studentId: uuid, amount: 5000 };

  it('accepts an amount and a student', () => {
    expect(accepts(MoneyMovementDto, valid)).toBe(true);
  });

  // The endpoint decides the direction. A negative deposit would otherwise be
  // a withdrawal wearing the wrong name.
  it('refuses a negative amount', () => {
    expect(errorsOn(MoneyMovementDto, { ...valid, amount: -5000 })).toContain(
      'amount',
    );
  });

  it('refuses an amount of nothing', () => {
    expect(errorsOn(MoneyMovementDto, { ...valid, amount: 0 })).toContain(
      'amount',
    );
  });

  // An unexplained reversal is indistinguishable from a mistake.
  it('refuses a reversal with no reason', () => {
    expect(errorsOn(ReverseTransactionDto, { transactionId: uuid })).toContain(
      'reason',
    );
  });

  it('takes a scan as free text, since a card is not a uuid', () => {
    expect(accepts(LookupDto, { identifier: 'STD-2025-231419-167' })).toBe(
      true,
    );
    expect(accepts(LookupDto, { identifier: 'ABCD-EFGH-JKMN' })).toBe(true);
  });
});

describe('an announcement', () => {
  const valid = {
    audience: 'ALL_PARENTS',
    title: 'School closes early on Friday',
    message: 'Buses leave at midday.',
  };

  it('accepts a whole-school audience with nothing else', () => {
    expect(accepts(BroadcastDto, valid)).toBe(true);
  });

  it('refuses an audience nobody defined', () => {
    expect(
      errorsOn(BroadcastDto, { ...valid, audience: 'EVERYONE' }),
    ).toContain('audience');
  });

  it('accepts year levels alongside a level audience', () => {
    expect(
      accepts(BroadcastDto, {
        ...valid,
        audience: 'PARENTS_OF_LEVELS',
        classLevelIds: [uuid],
      }),
    ).toBe(true);
  });

  it('refuses a level list that is not made of ids', () => {
    expect(
      errorsOn(BroadcastDto, { ...valid, classLevelIds: ['Senior 1'] }),
    ).toContain('classLevelIds');
  });

  // A message with no words is a notification nobody can act on.
  it('refuses a message with nothing in it', () => {
    expect(
      errorsOn(SendMessageDto, { conversationId: uuid, content: undefined }),
    ).toContain('content');
  });
});

describe('an activity', () => {
  const valid = {
    kind: 'TRIP',
    title: 'Nyungwe forest trip',
    startsAt: '2026-09-10T07:00:00.000Z',
  };

  it('accepts a kind, a title and a start', () => {
    expect(accepts(CreateActivityDto, valid)).toBe(true);
  });

  it('refuses a kind of thing the school does not run', () => {
    expect(errorsOn(CreateActivityDto, { ...valid, kind: 'PARTY' })).toContain(
      'kind',
    );
  });

  it('refuses a start that is not a real moment', () => {
    expect(
      errorsOn(CreateActivityDto, { ...valid, startsAt: 'next Tuesday' }),
    ).toContain('startsAt');
  });

  it('refuses a capacity of nobody', () => {
    expect(errorsOn(CreateActivityDto, { ...valid, capacity: 0 })).toContain(
      'capacity',
    );
  });
});

describe('the smaller declarations', () => {
  it('takes analytics scopes as ids or not at all', () => {
    expect(accepts(QueryAnalyticsDto, {})).toBe(true);
    expect(accepts(QueryAnalyticsDto, { termId: uuid })).toBe(true);
    expect(errorsOn(QueryAnalyticsDto, { termId: 'this-term' })).toContain(
      'termId',
    );
  });

  // A catalogue entry with no author is a book nobody can find on a shelf.
  it('needs a title, an author and a count of copies for a book', () => {
    expect(
      accepts(CreateBookDto, {
        title: 'Things Fall Apart',
        author: 'Chinua Achebe',
        quantity: 5,
      }),
    ).toBe(true);
    expect(errorsOn(CreateBookDto, { quantity: 5 })).toEqual(
      expect.arrayContaining(['title', 'author']),
    );
    expect(
      errorsOn(CreateBookDto, {
        title: 'Things Fall Apart',
        author: 'Chinua Achebe',
        quantity: 0,
      }),
    ).toContain('quantity');
  });

  it('needs a due date on a piece of work', () => {
    expect(
      errorsOn(CreateHomeworkDto, {
        subjectId: uuid,
        classSectionId: uuid,
        termId: uuid,
        title: 'Essay',
      }),
    ).toContain('dueDate');
  });
});

/**
 * The two fields a person types by hand.
 *
 * A Rwandan national ID is sixteen digits, and the office writes it out in
 * groups the way the card prints it. Boarding arrives as a checkbox from the
 * web and as the word "false" from a CSV import, and "false" is a truthy
 * string, so it needs reading before any conversion happens.
 */
describe('the national ID as it is typed in', () => {
  const nid = '1200888012345601';

  it.each([CreateUserDto, UpdateUserDto])(
    'takes it written in the groups the card prints (%#)',
    (cls) => {
      const dto: any = plainToInstance(cls, {
        nationalId: '1 2008 8 8012345 601',
      });
      expect(dto.nationalId).toBe(nid);
    },
  );

  it.each([CreateUserDto, UpdateUserDto])(
    'takes it written with no spaces at all (%#)',
    (cls) => {
      const dto: any = plainToInstance(cls, { nationalId: nid });
      expect(dto.nationalId).toBe(nid);
    },
  );

  // A CSV import can hand over a number rather than a string.
  it.each([CreateUserDto, UpdateUserDto])(
    'leaves a value that is not a string alone (%#)',
    (cls) => {
      const dto: any = plainToInstance(cls, { nationalId: 1234 });
      expect(dto.nationalId).toBe(1234);
    },
  );

  it.each([CreateUserDto, UpdateUserDto])(
    'refuses one of the wrong length (%#)',
    (cls) => {
      expect(errorsOn(cls, { nationalId: '1 2008 8 01' })).toContain(
        'nationalId',
      );
    },
  );
});

describe('boarding, however it arrives', () => {
  it.each([CreateUserDto, UpdateUserDto])(
    'takes a real boolean (%#)',
    (cls) => {
      expect((plainToInstance(cls, { isBoarder: true }) as any).isBoarder).toBe(
        true,
      );
      expect(
        (plainToInstance(cls, { isBoarder: false }) as any).isBoarder,
      ).toBe(false);
    },
  );

  // "false" is a truthy string, so a CSV import that sent it would have made
  // every day student a boarder.
  it.each([CreateUserDto, UpdateUserDto])(
    'reads the word false as false (%#)',
    (cls) => {
      expect(
        (plainToInstance(cls, { isBoarder: 'false' }) as any).isBoarder,
      ).toBe(false);
    },
  );

  it.each([CreateUserDto, UpdateUserDto])(
    'reads the word true as true (%#)',
    (cls) => {
      expect(
        (plainToInstance(cls, { isBoarder: 'true' }) as any).isBoarder,
      ).toBe(true);
    },
  );

  // Anything else is "not said", which is different from "day student".
  it.each([CreateUserDto, UpdateUserDto])(
    'treats anything else as not said (%#)',
    (cls) => {
      expect(
        (plainToInstance(cls, { isBoarder: 'maybe' }) as any).isBoarder,
      ).toBeUndefined();
      expect((plainToInstance(cls, {}) as any).isBoarder).toBeUndefined();
    },
  );
});
