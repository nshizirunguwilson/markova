import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  student,
  type RouteCase,
} from '../../test/controller';

/**
 * Library routes.
 *
 * `loans/my` is the one that matters: it is the only route on this controller
 * scoped to a person, and the scoping is a single argument.
 */
describe('LibraryController', () => {
  const service = mockService([
    'createBook',
    'bulkImport',
    'findAll',
    'findById',
    'updateBook',
    'deleteBook',
    'checkout',
    'returnBook',
    'reportLost',
    'getActiveLoans',
    'getOverdueLoans',
    'getDueReminders',
    'sendDueReminders',
    'getUserLoans',
    'getAnalytics',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(LibraryController, [
      { token: LibraryService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'a title added',
      call: (c) => c.createBook({ title: 'Things Fall Apart' }),
      calls: 'createBook',
      withArgs: [{ title: 'Things Fall Apart' }],
    },
    {
      name: 'a whole shelf imported',
      call: (c) => c.bulkImport({ books: [] }),
      calls: 'bulkImport',
      withArgs: [{ books: [] }],
    },
    {
      name: 'the catalogue, filtered',
      call: (c) => c.findAll({ search: 'Achebe' }),
      calls: 'findAll',
      withArgs: [{ search: 'Achebe' }],
    },
    {
      name: 'one title',
      call: (c) => c.findById('book-1'),
      calls: 'findById',
      withArgs: ['book-1'],
    },
    {
      name: 'a title corrected',
      call: (c) => c.updateBook('book-1', { title: 'Corrected' }),
      calls: 'updateBook',
      withArgs: ['book-1', { title: 'Corrected' }],
    },
    {
      name: 'a title withdrawn',
      call: (c) => c.deleteBook('book-1'),
      calls: 'deleteBook',
      withArgs: ['book-1'],
    },
    {
      name: 'a book lent out',
      call: (c) => c.checkout({ bookId: 'book-1', userId: 'u-1' }),
      calls: 'checkout',
      withArgs: [{ bookId: 'book-1', userId: 'u-1' }],
    },
    {
      name: 'a book brought back',
      call: (c) => c.returnBook({ loanId: 'loan-1' }),
      calls: 'returnBook',
      withArgs: [{ loanId: 'loan-1' }],
    },
    {
      // The route unwraps the DTO, so the service takes the id rather than
      // the body. Passing the body would silently look up nothing.
      name: 'a book reported lost, by loan id',
      call: (c) => c.reportLost({ loanId: 'loan-1' }),
      calls: 'reportLost',
      withArgs: ['loan-1'],
    },
    {
      name: 'what is currently out',
      call: (c) => c.getActiveLoans(),
      calls: 'getActiveLoans',
      withArgs: [],
    },
    {
      name: 'what is overdue',
      call: (c) => c.getOverdueLoans(),
      calls: 'getOverdueLoans',
      withArgs: [],
    },
    {
      name: 'what is about to be due',
      call: (c) => c.getDueReminders(),
      calls: 'getDueReminders',
      withArgs: [],
    },
    {
      name: 'reminders sent',
      call: (c) => c.sendDueReminders(),
      calls: 'sendDueReminders',
      withArgs: [],
    },
    {
      name: 'my own loans, nobody else’s',
      call: (c) => c.getMyLoans(student),
      calls: 'getUserLoans',
      withArgs: [student.id],
    },
    {
      name: 'how the library is used',
      call: (c) => c.getAnalytics(),
      calls: 'getAnalytics',
      withArgs: [],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });
});
