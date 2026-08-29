import { Role } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import {
  clearMocks,
  admin,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

jest.mock('../../common/file-validation', () => ({
  ...jest.requireActual('../../common/file-validation'),
  validateUploadedImage: jest.fn(),
}));

/**
 * User routes.
 *
 * Two of these are readable by everybody and self-scoped by hand rather than
 * by a guard: a person may read and change their own record and nobody else's.
 * That `if` is the whole protection, so it is what these tests hold.
 */
describe('UsersController', () => {
  const service = mockService([
    'findAll',
    'findOne',
    'create',
    'update',
    'softDelete',
    'updatePhoto',
    'bulkImport',
    'getImportTemplate',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    service.findOne.mockResolvedValue({ id: 'user-1', photoUrl: null });
    service.getImportTemplate.mockReturnValue('firstName,lastName\n');
    run = await controllerHarness(UsersController, [
      { token: UsersService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'the roll, filtered',
      call: (c) => c.findAll({ role: 'STUDENT', page: 2 }, admin),
      calls: 'findAll',
      withArgs: [{ role: 'STUDENT', page: 2 }],
    },
    {
      name: 'anybody, for the office',
      call: (c) => c.findOne('user-9', admin),
      calls: 'findOne',
      withArgs: ['user-9'],
    },
    {
      name: 'my own record',
      call: (c) => c.findOne(parent.id, parent),
      calls: 'findOne',
      withArgs: [parent.id],
    },
    {
      name: 'an account created',
      call: (c) => c.create({ firstName: 'Divine', role: 'STUDENT' }),
      calls: 'create',
      withArgs: [{ firstName: 'Divine', role: 'STUDENT' }],
    },
    {
      name: 'an account changed',
      call: (c) => c.update('user-1', { firstName: 'Divine' }),
      calls: 'update',
      withArgs: ['user-1', { firstName: 'Divine' }],
    },
    {
      name: 'an account retired rather than erased',
      call: (c) => c.softDelete('user-1'),
      calls: 'softDelete',
      withArgs: ['user-1'],
    },
    {
      // The role is stamped onto every row here rather than trusted from the
      // spreadsheet, so an import of parents cannot smuggle in an admin.
      name: 'a spreadsheet imported, with the role stamped on every row',
      call: (c) =>
        c.bulkImport({
          role: 'STUDENT',
          rows: [{ firstName: 'A' }, { firstName: 'B', role: 'ADMIN' }],
        }),
      calls: 'bulkImport',
      withArgs: [
        [
          { firstName: 'A', role: 'STUDENT' },
          { firstName: 'B', role: 'STUDENT' },
        ],
      ],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * The check a role guard cannot make: everybody has one of these roles, so
   * without it any signed-in account could read any other.
   */
  describe('a person is held to their own record', () => {
    it('refuses somebody else’s profile', async () => {
      const run2 = await controllerHarness(UsersController, [
        { token: UsersService, name: 'service', mock: service },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) => c.findOne('somebody-else', parent),
          calls: 'findOne',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('refuses somebody else’s photo', async () => {
      const run2 = await controllerHarness(UsersController, [
        { token: UsersService, name: 'service', mock: service },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) =>
            c.uploadPhoto('somebody-else', { filename: 'a.png' }, parent),
          calls: 'updatePhoto',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.updatePhoto).not.toHaveBeenCalled();
    });

    it('lets the office change anybody’s photo', async () => {
      await run({
        name: 'admin',
        call: (c) => c.uploadPhoto('user-9', { filename: 'a.png' }, admin),
        calls: 'updatePhoto',
        withArgs: ['user-9', '/uploads/photos/a.png'],
      });
    });

    it('refuses a photo request that carried no file', async () => {
      const run2 = await controllerHarness(UsersController, [
        { token: UsersService, name: 'service', mock: service },
      ]);
      await expect(
        run2({
          name: 'no file',
          call: (c) => c.uploadPhoto('user-1', undefined, admin),
          calls: 'updatePhoto',
        }),
      ).rejects.toThrow(/required/i);
    });
  });

  /**
   * The import template is written straight onto the response, so the headers
   * are the only thing that makes a browser save it as a file.
   */
  describe('the import template', () => {
    it('is sent as a CSV download named for the role', async () => {
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await run({
        name: 'template',
        call: (c) => c.getTemplate('TEACHER', res),
        calls: 'getImportTemplate',
        withArgs: ['TEACHER'],
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=teacher_import_template.csv',
      );
      expect(res.send).toHaveBeenCalledWith('firstName,lastName\n');
    });
  });
});

/**
 * Who may read the directory.
 *
 * A nurse recording a clinic visit has to find the student first, and this
 * route was the only way to do it - so the "New visit" form had a student box
 * that answered 403 on every keystroke. Opening the directory to her outright
 * would hand over every teacher's and parent's email and phone.
 */
describe('UsersController and the welfare staff', () => {
  let service: { findAll: jest.Mock };
  let controller: UsersController;

  beforeEach(() => {
    service = { findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }) };
    controller = new UsersController(service as never);
  });

  it.each(['PATRON', 'MATRON', 'NURSE'])(
    'gives a %s students and nothing else',
    async (role) => {
      await controller.findAll({ role: 'TEACHER' } as never, {
        role,
      });
      // The role they asked for is overwritten, not merely defaulted.
      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.STUDENT }),
      );
    },
  );

  it('keeps the rest of the query they sent', async () => {
    await controller.findAll(
      { search: 'Keza', limit: 10 },
      {
        role: 'NURSE',
      },
    );
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Keza',
        limit: 10,
        role: Role.STUDENT,
      }),
    );
  });

  it('leaves an administrator asking for whatever they asked for', async () => {
    await controller.findAll({ role: 'TEACHER' } as never, { role: 'ADMIN' });
    expect(service.findAll).toHaveBeenCalledWith({ role: 'TEACHER' });
  });
});
