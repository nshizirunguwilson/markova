import { SchoolConfigController } from './school-config.controller';
import { PublicConfigController } from './public-config.controller';
import { SchoolConfigService } from './school-config.service';
import {
  buildController,
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

jest.mock('../../common/file-validation', () => ({
  ...jest.requireActual('../../common/file-validation'),
  validateUploadedImage: jest.fn(),
}));

/**
 * School settings and branding.
 *
 * The three upload routes are near-identical and each writes to a different
 * key. A copied route pointing at the wrong key would replace a school's logo
 * with its head teacher's signature, which is exactly the sort of thing that
 * only shows up on a printed report card.
 */
describe('SchoolConfigController', () => {
  const service = mockService([
    'findAll',
    'getOnboardingStatus',
    'findByKey',
    'upsert',
    'bulkUpsert',
    'updateOnboarding',
    'delete',
    'updateBrandingFile',
    'getPublicBranding',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    service.findByKey.mockResolvedValue({ value: null });
    run = await controllerHarness(SchoolConfigController, [
      { token: SchoolConfigService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'every setting',
      call: (c) => c.findAll(),
      calls: 'findAll',
      withArgs: [],
    },
    {
      name: 'how far through setup the school is',
      call: (c) => c.getOnboarding(),
      calls: 'getOnboardingStatus',
      withArgs: [],
    },
    {
      name: 'one setting by name',
      call: (c) => c.findByKey('grading_scale'),
      calls: 'findByKey',
      withArgs: ['grading_scale'],
    },
    {
      name: 'one setting written',
      call: (c) => c.upsert({ key: 'pass_mark', value: '50' }),
      calls: 'upsert',
      withArgs: [{ key: 'pass_mark', value: '50' }],
    },
    {
      name: 'a page of settings written at once',
      call: (c) => c.bulkUpsert({ configs: [] }),
      calls: 'bulkUpsert',
      withArgs: [{ configs: [] }],
    },
    {
      name: 'setup moved along',
      call: (c) => c.updateOnboarding({ currentStep: 'CLASSES' }),
      calls: 'updateOnboarding',
      withArgs: [{ currentStep: 'CLASSES' }],
    },
    {
      name: 'a setting removed',
      call: (c) => c.delete('pass_mark'),
      calls: 'delete',
      withArgs: ['pass_mark'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * Each upload writes to its own key. Nothing else distinguishes them.
   */
  describe('branding uploads', () => {
    it.each([
      ['the logo', 'uploadLogo', 'logo_url'],
      ['the stamp', 'uploadStamp', 'stamp_url'],
      ['the signature', 'uploadSignature', 'signature_url'],
    ])('%s is stored under its own key', async (_n, method, key) => {
      await run({
        name: 'upload',
        call: (c) => (c as any)[method]({ filename: 'abc.png' }),
        calls: 'updateBrandingFile',
        withArgs: [key, '/uploads/branding/abc.png'],
      });
    });

    // Replacing a logo should not leave the old file on disk forever, but a
    // missing previous value must not stop the new one being saved either.
    it('saves the new file even when there was no old one to remove', async () => {
      service.findByKey.mockRejectedValueOnce(new Error('Not found'));
      await run({
        name: 'first logo',
        call: (c) => (c as any).uploadLogo({ filename: 'first.png' }),
        calls: 'updateBrandingFile',
        withArgs: ['logo_url', '/uploads/branding/first.png'],
      });
    });

    it('looks for the previous file before writing the new one', async () => {
      const ctl: any = await buildController(SchoolConfigController, [
        { token: SchoolConfigService, name: 'service', mock: service },
      ]);
      await ctl.uploadStamp({ filename: 'abc.png' });
      expect(service.findByKey).toHaveBeenCalledWith('stamp_url');
    });
  });
});

/**
 * The one unguarded route in the system, and deliberately so: the login page
 * needs the school's name and colour before anybody has signed in.
 */
describe('PublicConfigController', () => {
  const service = mockService(['getPublicBranding']);

  it('answers with branding only', async () => {
    const run = await controllerHarness(PublicConfigController, [
      { token: SchoolConfigService, name: 'service', mock: service },
    ]);
    await run({
      name: 'branding',
      call: (c) => c.getBranding(),
      calls: 'getPublicBranding',
      withArgs: [],
    });
  });
});
