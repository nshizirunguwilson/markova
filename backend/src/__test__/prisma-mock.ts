import { PrismaService } from '../prisma/prisma.service';

const modelMethods = [
  'findFirst',
  'findUnique',
  'findMany',
  'create',
  'update',
  'upsert',
  'delete',
  'count',
  'createMany',
  'updateMany',
  'deleteMany',
  'groupBy',
  'aggregate',
] as const;

// All Prisma model names (camelCase) derived from schema.prisma
const modelNames = [
  'schoolConfig',
  'user',
  'userSession',
  'auditLog',
  'academicYear',
  'term',
  'classLevel',
  'classSection',
  'subject',
  'assessmentType',
  'timetable',
  'student',
  'parentStudent',
  'teacher',
  'teacherRole',
  'teacherSubjectClass',
  'mark',
  'termResult',
  'yearResult',
  'attendance',
  'teacherAttendance',
  'disciplineIncident',
  'disciplineAppeal',
  'book',
  'bookLoan',
  'homework',
  'homeworkSubmission',
  'conversation',
  'conversationParticipant',
  'message',
  'messageRead',
  'notification',
  'supportTicket',
  'faqArticle',
  'trade',
  'examSchedule',
  'pushToken',
  'pocketMoneyAccount',
  'pocketMoneyTransaction',
  'activity',
  'activityClassLevel',
  'activitySection',
  'activityParticipant',
  'clinicVisit',
  'medicationAdministration',
  'studentHealthRecord',
  'meritAward',
] as const;

type MockPrisma = {
  [K in (typeof modelNames)[number]]: {
    [M in (typeof modelMethods)[number]]: jest.Mock;
  };
} & {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $executeRaw: jest.Mock;
};

export function createMockPrisma(): MockPrisma & PrismaService {
  const mock: Record<string, unknown> = {};

  for (const model of modelNames) {
    const modelMock: Record<string, jest.Mock> = {};
    for (const method of modelMethods) {
      modelMock[method] = jest.fn();
    }
    mock[model] = modelMock;
  }

  // $transaction calls the callback with the same mock object
  mock.$transaction = jest.fn().mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return cb(mock);
    }
    // Support array-of-promises style
    return Promise.all(cb as Promise<unknown>[]);
  });

  // Raw SQL, for the handful of aggregate reads that drop to it.
  mock.$queryRaw = jest.fn();
  mock.$queryRawUnsafe = jest.fn();
  mock.$executeRaw = jest.fn();

  return mock as unknown as MockPrisma & PrismaService;
}
