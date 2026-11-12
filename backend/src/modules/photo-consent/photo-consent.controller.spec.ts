import { PhotoConsentController } from './photo-consent.controller';
import { PhotoConsentService } from './photo-consent.service';
import {
  admin,
  clearMocks,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/** The photo answers (B6): who is asking goes through, so the service decides. */
describe('PhotoConsentController', () => {
  const service = mockService(['forStudent', 'answer', 'register']);
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(PhotoConsentController, [
      { token: PhotoConsentService, name: 'service', mock: service },
    ]);
  });

  const answers = { forId: 'YES', inApp: 'NO', publicity: 'NO' };
  const cases: RouteCase[] = [
    {
      name: 'the answers read',
      call: (c) => c.read('s1', parent),
      calls: 'forStudent',
      withArgs: ['s1', parent],
    },
    {
      name: 'an answer given',
      call: (c) => c.answer('s1', answers, parent),
      calls: 'answer',
      withArgs: ['s1', answers, parent],
    },
    {
      name: 'the office list',
      call: (c) => c.register(),
      calls: 'register',
      withArgs: [],
    },
  ];
  it.each(cases.map((c) => [c.name, c]))('passes on %s', async (_n, c) =>
    run(c),
  );

  it('passes the office on too, copying a paper form', async () => {
    await run({
      name: 'paper',
      call: (c) =>
        c.answer('s1', { ...answers, answeredBy: 'Marie (mother)' }, admin),
      calls: 'answer',
      withArgs: ['s1', { ...answers, answeredBy: 'Marie (mother)' }, admin],
    });
  });
});
