import { withSchool } from '../../prisma/request-context';
import { BadRequestException } from '@nestjs/common';
import { SchoolConfigController } from './school-config.controller';
import { PublicConfigController } from './public-config.controller';
import { SchoolConfigService } from './school-config.service';
import { PublicSchoolService } from '../../prisma/public-school.service';
import { currentRequest } from '../../prisma/request-context';
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
    /* A school's files go in its own folder, so an upload runs inside one. */
    const inSchool = <T>(fn: () => Promise<T>) => withSchool('school-1', fn);

    it.each([
      ['the logo', 'uploadLogo', 'logo_url'],
      ['the stamp', 'uploadStamp', 'stamp_url'],
      ['the signature', 'uploadSignature', 'signature_url'],
    ])('%s is stored under its own key', async (_n, method, key) => {
      await run({
        name: 'upload',
        call: (c) => inSchool(() => c[method]({ filename: 'abc.png' })),
        calls: 'updateBrandingFile',
        withArgs: [key, '/uploads/schools/school-1/branding/abc.png'],
      });
    });

    // The file a replacement takes over from is moved aside rather than
    // deleted, but a missing previous value must not stop the new one being
    // saved either.
    it('saves the new file even when there was no old one to remove', async () => {
      service.findByKey.mockRejectedValueOnce(new Error('Not found'));
      await run({
        name: 'first logo',
        call: (c) => inSchool(() => c.uploadLogo({ filename: 'first.png' })),
        calls: 'updateBrandingFile',
        withArgs: ['logo_url', '/uploads/schools/school-1/branding/first.png'],
      });
    });

    it('looks for the previous file before writing the new one', async () => {
      const ctl: any = await buildController(SchoolConfigController, [
        { token: SchoolConfigService, name: 'service', mock: service },
      ]);
      await inSchool(() => ctl.uploadStamp({ filename: 'abc.png' }));
      expect(service.findByKey).toHaveBeenCalledWith('stamp_url');
    });

    /**
     * Without this the handler dereferenced `file.filename` on undefined and
     * the request came back as a bare 500 - the same thing the settings page
     * shows when the API is down, so "Failed to upload logo" told an admin
     * nothing about what to do next.
     */
    it.each([
      ['the logo', 'uploadLogo'],
      ['the stamp', 'uploadStamp'],
      ['the signature', 'uploadSignature'],
    ])(
      'says %s arrived with no file rather than crashing',
      async (_n, method) => {
        const ctl: any = await buildController(SchoolConfigController, [
          { token: SchoolConfigService, name: 'service', mock: service },
        ]);
        await expect(ctl[method](undefined)).rejects.toThrow(
          BadRequestException,
        );
        expect(service.updateBrandingFile).not.toHaveBeenCalled();
      },
    );
  });
});

/**
 * The one unguarded route in the system, and deliberately so: the login page
 * needs the school's name and colour before anybody has signed in.
 */
describe('PublicConfigController', () => {
  const service = mockService(['getPublicBranding']);
  const publicSchool = { resolve: jest.fn().mockResolvedValue('school-1') };
  const req = { headers: {} } as any;

  it('answers with branding only', async () => {
    const run = await controllerHarness(PublicConfigController, [
      { token: SchoolConfigService, name: 'service', mock: service },
      { token: PublicSchoolService, name: 'publicSchool', mock: publicSchool },
    ]);
    await run({
      name: 'branding',
      call: (c) => c.getBranding(req),
      calls: 'getPublicBranding',
      withArgs: [],
    });
  });

  /* The sign in page has nobody signed in: the school comes from the page. */
  it('reads the branding inside the school the page belongs to', async () => {
    let seen: string | undefined;
    service.getPublicBranding.mockImplementation(() => {
      seen = currentRequest()?.schoolId;
      return Promise.resolve({ schoolName: 'Kigali Hill' });
    });
    publicSchool.resolve.mockResolvedValue('school-7');
    const controller: any = await buildController(PublicConfigController, [
      { token: SchoolConfigService, name: 'service', mock: service },
      { token: PublicSchoolService, name: 'publicSchool', mock: publicSchool },
    ]);
    await expect(controller.getBranding(req)).resolves.toEqual({
      schoolName: 'Kigali Hill',
    });
    expect(seen).toBe('school-7');
  });
});
