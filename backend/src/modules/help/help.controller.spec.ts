import { HelpController } from './help.controller';
import { HelpService } from './help.service';
import {
  clearMocks,
  admin,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/**
 * The help desk.
 *
 * Two routes read tickets and they are not the same route: one is every
 * ticket in the school and one is mine. Confusing them would show a parent
 * the whole support queue.
 */
describe('HelpController', () => {
  const service = mockService([
    'findAllFaqs',
    'findAllFaqsAdmin',
    'createFaq',
    'updateFaq',
    'deleteFaq',
    'createTicket',
    'findAllTickets',
    'findMyTickets',
    'updateTicketStatus',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(HelpController, [
      { token: HelpService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'the published questions',
      call: (c) => c.findFaqs('password'),
      calls: 'findAllFaqs',
      withArgs: ['password'],
    },
    {
      name: 'every question, including the unpublished',
      call: (c) => c.findFaqsAdmin(),
      calls: 'findAllFaqsAdmin',
      withArgs: [],
    },
    {
      name: 'a question written',
      call: (c) => c.createFaq({ title: 'How do I?', content: 'Like this' }),
      calls: 'createFaq',
      withArgs: [{ title: 'How do I?', content: 'Like this' }],
    },
    {
      name: 'a question changed',
      call: (c) => c.updateFaq('faq-1', { title: 'Changed' }),
      calls: 'updateFaq',
      withArgs: ['faq-1', { title: 'Changed' }],
    },
    {
      name: 'a question removed',
      call: (c) => c.deleteFaq('faq-1'),
      calls: 'deleteFaq',
      withArgs: ['faq-1'],
    },
    {
      name: 'a ticket raised, attributed to whoever raised it',
      call: (c) =>
        c.createTicket({ user: parent }, { title: 'Broken', description: 'It is' }),
      calls: 'createTicket',
      withArgs: [parent.id, { title: 'Broken', description: 'It is' }],
    },
    {
      name: 'the whole queue, for the office',
      call: (c) => c.findAllTickets('OPEN'),
      calls: 'findAllTickets',
      withArgs: ['OPEN'],
    },
    {
      // Not the same route as the one above, and the difference is the only
      // thing keeping one parent out of another's tickets.
      name: 'my own tickets, nobody else’s',
      call: (c) => c.findMyTickets({ user: parent }),
      calls: 'findMyTickets',
      withArgs: [parent.id],
    },
    {
      name: 'a ticket moved along',
      call: (c) => c.updateTicketStatus('t-1', { status: 'RESOLVED' }),
      calls: 'updateTicketStatus',
      withArgs: ['t-1', { status: 'RESOLVED' }],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  it('reads the whole queue and mine through different service methods', async () => {
    await run(cases.find((c) => c.calls === 'findAllTickets')!);
    expect(service.findMyTickets).not.toHaveBeenCalled();
    await run(cases.find((c) => c.calls === 'findMyTickets')!);
    expect(service.findAllTickets).not.toHaveBeenCalled();
  });
});
