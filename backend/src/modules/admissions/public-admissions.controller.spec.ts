import { BadRequestException } from '@nestjs/common';
import { PublicAdmissionsController } from './public-admissions.controller';

/**
 * The family's document upload, as the route sees it: it needs a file, and
 * it works inside the school whose admissions page this is.
 */
describe('PublicAdmissionsController, sending a document', () => {
  const service = {
    attachFromFamily: jest.fn().mockResolvedValue({ id: 'doc-1' }),
  };
  const publicSchool = { resolve: jest.fn().mockResolvedValue('school-1') };
  const controller = new PublicAdmissionsController(
    service as never,
    publicSchool as never,
  );
  const dto = {
    reference: 'APP-2026-0417',
    dateOfBirth: '2013-04-02',
    kind: 'BIRTH_CERTIFICATE',
  } as never;
  const file = {
    buffer: Buffer.from('%PDF'),
    mimetype: 'application/pdf',
    originalname: 'bc.pdf',
    size: 4,
  } as never;

  beforeEach(() => jest.clearAllMocks());

  it('asks for a file when none came', async () => {
    await expect(
      controller.attachDocument(undefined, dto, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.attachFromFamily).not.toHaveBeenCalled();
  });

  it('stores it in the school the admissions page belongs to', async () => {
    await controller.attachDocument(file, dto, {} as never);
    expect(service.attachFromFamily).toHaveBeenCalledWith(
      'APP-2026-0417',
      '2013-04-02',
      'BIRTH_CERTIFICATE',
      file,
      'school-1',
    );
  });
});
