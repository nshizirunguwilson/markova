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
] as const;

type MockPrisma = {
  [K in (typeof modelNames)[number]]: {
    [M in (typeof modelMethods)[number]]: jest.Mock;
  };
} & {
  $transaction: jest.Mock;
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

  return mock as unknown as MockPrisma & PrismaService;
}
