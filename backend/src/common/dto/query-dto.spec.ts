// The decorators on every DTO are read through Reflect. Nest's own
// bootstrap loads this; a spec that imports a DTO directly has to.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  BulkAttendanceDto,
  QueryAttendanceDto,
} from '../../modules/attendance/dto';
import { QueryMarksDto } from '../../modules/marks/dto';
import { QueryBooksDto } from '../../modules/library/dto';
import { QueryHomeworkDto } from '../../modules/homework/dto';
import {
  QueryConversationsDto,
  QueryMessagesDto,
} from '../../modules/messaging/dto';
import { QueryUserDto } from '../../modules/users/dto/query-user.dto';
import { ActivityQueryDto } from '../../modules/activities/dto';
import { VisitQueryDto } from '../../modules/clinic/dto';
import { QueryMeritsDto } from '../../modules/discipline/dto';
import { PocketMoneyQueryDto } from '../../modules/pocket-money/dto';
import { IdCardRegistryQueryDto } from '../../modules/reports/dto';
import { QueryIncidentsDto } from '../../modules/discipline/dto';
import { QueryAnalyticsDto } from '../../modules/analytics/dto';
import {
  AdmissionQueryDto,
  SaveIntakeDto,
} from '../../modules/admissions/dto';

/**
 * Query strings.
 *
 * Everything in a URL arrives as text. These declarations are what turn
 * `?page=3` into the number 3 before it reaches a service that will do
 * arithmetic with it, and what stops `?limit=100000` reaching the database at
 * all.
 */

const parse = <T>(cls: new () => T, query: Record<string, unknown>): T =>
  plainToInstance(cls, query, { enableImplicitConversion: true });

const errorsOn = (cls: any, query: Record<string, unknown>): string[] =>
  validateSync(parse(cls, query), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((e) => e.property);

/** Every list endpoint's query declaration, and the field it pages by. */
const PAGED: [string, any][] = [
  ['attendance', QueryAttendanceDto],
  ['marks', QueryMarksDto],
  ['books', QueryBooksDto],
  ['assessments', QueryHomeworkDto],
  ['conversations', QueryConversationsDto],
  ['messages', QueryMessagesDto],
  ['users', QueryUserDto],
  ['activities', ActivityQueryDto],
  ['clinic visits', VisitQueryDto],
  ['merits', QueryMeritsDto],
  ['pocket money', PocketMoneyQueryDto],
  ['ID cards', IdCardRegistryQueryDto],
  ['applications', AdmissionQueryDto],
];

describe.each(PAGED)('the %s query', (_name, cls) => {
  it('reads a page number out of the text a URL carries', () => {
    const dto: any = parse(cls, { page: '3' });
    expect(dto.page).toBe(3);
    expect(typeof dto.page).toBe('number');
  });

  it('reads a page size the same way', () => {
    const dto: any = parse(cls, { limit: '50' });
    expect(dto.limit).toBe(50);
  });

  it('refuses a page before the first', () => {
    expect(errorsOn(cls, { page: '0' })).toContain('page');
  });

  // Without the ceiling, one request could ask the database for every row in
  // a table with hundreds of thousands of them.
  it('refuses a page size big enough to pull a whole table', () => {
    expect(errorsOn(cls, { limit: '100000' })).toContain('limit');
  });

  it('accepts a query with no paging at all', () => {
    expect(errorsOn(cls, {})).toEqual([]);
  });
});

/**
 * The roll's own filters, which are the ones a person actually types into.
 */
describe('the user query', () => {
  it('narrows to a role', () => {
    expect(errorsOn(QueryUserDto, { role: 'STUDENT' })).toEqual([]);
  });

  it('refuses a role nobody has', () => {
    expect(errorsOn(QueryUserDto, { role: 'HEADMASTER' })).toContain('role');
  });

  /**
   * The pipe converts implicitly, so a bare `@IsBoolean()` would see the
   * string "false" already turned into boolean true. The transform reads the
   * raw value instead.
   */
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('reads isActive=%s as %s', (raw, expected) => {
    const dto: any = parse(QueryUserDto, { isActive: raw });
    expect(dto.isActive).toBe(expected);
  });

  /**
   * Anything that is neither "true" nor "false" becomes undefined, which
   * `@IsOptional()` then lets through as "no filter". That is the right
   * reading of a stray query parameter: narrow to nothing rather than
   * guessing which half of the roll somebody meant.
   */
  it('treats an isActive that is neither as no filter at all', () => {
    const dto: any = parse(QueryUserDto, { isActive: 'maybe' });
    expect(dto.isActive).toBeUndefined();
    expect(errorsOn(QueryUserDto, { isActive: 'maybe' })).toEqual([]);
  });

  it('pins a search to one field group', () => {
    expect(
      errorsOn(QueryUserDto, { search: 'NIT', searchIn: 'class' }),
    ).toEqual([]);
  });

  it('refuses a field group that does not exist', () => {
    expect(errorsOn(QueryUserDto, { searchIn: 'blood-type' })).toContain(
      'searchIn',
    );
  });

  it('narrows to a class and a student standing', () => {
    expect(
      errorsOn(QueryUserDto, {
        classSectionId: 'a0000000-0000-4000-8000-000000000001',
        studentStatus: 'GRADUATED',
      }),
    ).toEqual([]);
  });
});

describe('the incidents query', () => {
  it('takes a date range', () => {
    expect(
      errorsOn(QueryIncidentsDto, {
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      }),
    ).toEqual([]);
  });

  it('refuses a date that is not a date', () => {
    expect(errorsOn(QueryIncidentsDto, { dateFrom: 'last term' })).toContain(
      'dateFrom',
    );
  });
});

describe('the analytics query', () => {
  it('takes each scope as an id', () => {
    const id = 'a0000000-0000-4000-8000-000000000001';
    expect(
      errorsOn(QueryAnalyticsDto, {
        academicYearId: id,
        termId: id,
        classSectionId: id,
      }),
    ).toEqual([]);
  });

  it('refuses a scope that is not an id', () => {
    expect(errorsOn(QueryAnalyticsDto, { academicYearId: '2026' })).toContain(
      'academicYearId',
    );
  });
});

/**
 * A whole class register arrives as one nested list, so each row inside it is
 * validated as well as the envelope around it.
 */
describe('a bulk register', () => {
  const uuid = 'a0000000-0000-4000-8000-000000000001';

  it('accepts a list of rows', () => {
    expect(
      errorsOn(BulkAttendanceDto, {
        classSectionId: uuid,
        date: '2026-08-20',
        type: 'daily',
        records: [{ studentId: uuid, status: 'PRESENT' }],
      }),
    ).toEqual([]);
  });

  // A bad row inside a list of forty must not be waved through because the
  // envelope around it looked fine.
  it('refuses a row with a status nobody recognises', () => {
    expect(
      errorsOn(BulkAttendanceDto, {
        classSectionId: uuid,
        date: '2026-08-20',
        type: 'daily',
        records: [{ studentId: uuid, status: 'MAYBE' }],
      }),
    ).toContain('records');
  });

  it('refuses a row naming no student', () => {
    expect(
      errorsOn(BulkAttendanceDto, {
        classSectionId: uuid,
        date: '2026-08-20',
        type: 'daily',
        records: [{ status: 'PRESENT' }],
      }),
    ).toContain('records');
  });
});

/**
 * A round's places arrive from a form as text like every other field, and the
 * number is what the desk subtracts offers from. A string here would make
 * "places left" read 80 minus 6 as "806".
 */
describe('opening a round', () => {
  it('reads the places out of the text a form sends', () => {
    const dto: any = parse(SaveIntakeDto, {
      academicYearId: 'year-1',
      classLevelId: 'level-1',
      entryPoint: 'SENIOR_ONE',
      name: 'Senior 1 intake, 2026',
      places: '80',
      opensAt: '2026-06-01',
      closesAt: '2026-08-15',
    });
    expect(dto.places).toBe(80);
    expect(typeof dto.places).toBe('number');
  });

  it('refuses a round with fewer than no places', () => {
    expect(
      errorsOn(SaveIntakeDto, {
        academicYearId: 'year-1',
        classLevelId: 'level-1',
        entryPoint: 'SENIOR_ONE',
        name: 'Senior 1 intake, 2026',
        places: '-5',
        opensAt: '2026-06-01',
        closesAt: '2026-08-15',
      }),
    ).toContain('places');
  });
});
