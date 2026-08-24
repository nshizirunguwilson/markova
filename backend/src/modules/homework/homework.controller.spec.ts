import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  parent,
  student,
  teacher,
  type RouteCase,
} from '../../test/controller';

/**
 * Assessment routes.
 *
 * Two things here are only correct by argument: a teacher acts as their
 * Teacher id and not their User id, and a student's work is reachable by that
 * student's own family rather than by anyone with the role.
 */
describe('HomeworkController', () => {
  const service = mockService([
    'create',
    'findAll',
    'findById',
    'update',
    'delete',
    'submit',
    'grade',
    'getStudentHomework',
  ]);
  const ownership = mockService([
    'verifyTeacherHomeworkAccess',
    'verifyStudentAccess',
  ]);

  const withTeacherId = { ...teacher, teacherId: 'teacher-1' };

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, ownership);
    run = await controllerHarness(HomeworkController, [
      { token: HomeworkService, name: 'service', mock: service },
      { token: OwnershipService, name: 'ownership', mock: ownership },
    ]);
  });

  const cases: RouteCase[] = [
    {
      // The teacher id, not the user id. Comparing a User id against a Teacher
      // id has already cost this codebase a feature that matched nothing.
      name: 'set by a teacher, as their teacher record',
      call: (c) => c.create({ title: 'Essay' }, withTeacherId),
      calls: 'create',
      withArgs: [{ title: 'Essay' }, 'teacher-1', 'TEACHER'],
    },
    {
      name: 'the list, filtered',
      call: (c) => c.findAll({ classSectionId: 'section-1' }),
      calls: 'findAll',
      withArgs: [{ classSectionId: 'section-1' }],
    },
    {
      name: 'one piece of work',
      call: (c) => c.findById('hw-1', withTeacherId),
      calls: 'findById',
      withArgs: ['hw-1'],
    },
    {
      name: 'changed by the teacher who set it',
      call: (c) => c.update('hw-1', { title: 'Essay v2' }, withTeacherId),
      calls: 'update',
      withArgs: ['hw-1', { title: 'Essay v2' }, 'teacher-1', 'TEACHER'],
    },
    {
      name: 'withdrawn by the teacher who set it',
      call: (c) => c.delete('hw-1', withTeacherId),
      calls: 'delete',
      withArgs: ['hw-1', 'teacher-1', 'TEACHER'],
    },
    {
      name: 'handed in, as the student handing it in',
      call: (c) => c.submit({ homeworkId: 'hw-1' }, student),
      calls: 'submit',
      withArgs: [{ homeworkId: 'hw-1' }, student.studentId],
    },
    {
      name: 'marked, attributed to whoever marked it',
      call: (c) => c.grade('sub-1', { marks: 17 }, withTeacherId),
      calls: 'grade',
      withArgs: ['sub-1', { marks: 17 }, withTeacherId.id],
    },
    {
      name: 'one student’s work',
      call: (c) => c.getStudentHomework('student-1', 'section-1', parent),
      calls: 'getStudentHomework',
      withArgs: ['student-1', 'section-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * The checks that a role guard cannot make, because they are about whose
   * student and whose class this is.
   */
  describe('ownership is checked, not assumed', () => {
    it('checks the teacher owns the work before opening it', async () => {
      await run({
        name: 'checked',
        call: (c) => c.findById('hw-1', withTeacherId),
        on: 'ownership',
        calls: 'verifyTeacherHomeworkAccess',
        withArgs: [withTeacherId.id, 'TEACHER', 'hw-1'],
      });
    });

    it('checks the student belongs to the person asking', async () => {
      await run({
        name: 'checked',
        call: (c) => c.getStudentHomework('student-1', 'section-1', parent),
        on: 'ownership',
        calls: 'verifyStudentAccess',
        withArgs: [parent.id, 'PARENT', 'student-1'],
      });
    });

    it('refuses before reading anything', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(
        new Error('Forbidden'),
      );
      const c: any = await controllerHarness(HomeworkController, [
        { token: HomeworkService, name: 'service', mock: service },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);
      await expect(
        c({
          name: 'blocked',
          call: (ctl: any) => ctl.getStudentHomework('student-1', 's', parent),
          calls: 'getStudentHomework',
        }),
      ).rejects.toThrow();
      expect(service.getStudentHomework).not.toHaveBeenCalled();
    });
  });
});
