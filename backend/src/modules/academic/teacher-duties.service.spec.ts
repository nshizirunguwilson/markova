import { createMockPrisma } from '../../__test__/prisma-mock';
import { TeacherDutiesService } from './teacher-duties.service';

/**
 * Naming class teachers, heads of department and a Director of Studies.
 * Only the seed could do it before, so a real school never could.
 */
describe('TeacherDutiesService', () => {
  let prisma: any;
  let service: TeacherDutiesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TeacherDutiesService(prisma);
    prisma.teacher.findFirst.mockResolvedValue({
      id: 'tch-aline',
      user: { isActive: true },
    });
    prisma.classSection.findFirst.mockResolvedValue({ id: 'class-s2a' });
    prisma.teacherRole.findMany.mockResolvedValue([]);
    prisma.teacherRole.create.mockImplementation(({ data }: any) => ({
      id: 'duty-1',
      ...data,
    }));
  });

  it('names a class teacher for a class that has none', async () => {
    const out = await service.add('tch-aline', {
      role: 'CLASS_TEACHER',
      classSectionId: 'class-s2a',
    });
    expect(out.duty).toMatchObject({
      teacherId: 'tch-aline',
      role: 'CLASS_TEACHER',
      classSectionId: 'class-s2a',
    });
    expect(out.replaced).toBeNull();
  });

  it('hands a class over, and says who led it before', async () => {
    prisma.teacherRole.findMany.mockResolvedValue([
      {
        id: 'duty-old',
        teacherId: 'tch-jean',
        teacher: { user: { firstName: 'Jean', lastName: 'Habimana' } },
      },
    ]);
    const out = await service.add('tch-aline', {
      role: 'CLASS_TEACHER',
      classSectionId: 'class-s2a',
    });
    expect(prisma.teacherRole.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['duty-old'] } },
    });
    expect(out.replaced).toBe('Jean Habimana');
  });

  it('refuses naming a teacher to a class they already lead', async () => {
    prisma.teacherRole.findMany.mockResolvedValue([
      { id: 'd', teacherId: 'tch-aline', teacher: { user: {} } },
    ]);
    await expect(
      service.add('tch-aline', {
        role: 'CLASS_TEACHER',
        classSectionId: 'class-s2a',
      }),
    ).rejects.toThrow('already leads this class');
  });

  it('asks which class a class teacher leads', async () => {
    await expect(
      service.add('tch-aline', { role: 'CLASS_TEACHER' }),
    ).rejects.toThrow('Say which class');
  });

  it('matches a department however it was typed', async () => {
    await service.add('tch-aline', { role: 'HOD', department: ' Sciences ' });
    expect(prisma.teacherRole.findMany.mock.calls[0][0].where).toEqual({
      role: 'HOD',
      department: { equals: 'Sciences', mode: 'insensitive' },
    });
    expect(prisma.teacherRole.create.mock.calls[0][0].data.department).toBe(
      'Sciences',
    );
  });

  it('asks which department a head of department heads', async () => {
    await expect(
      service.add('tch-aline', { role: 'HOD', department: '  ' }),
    ).rejects.toThrow('Say which department');
  });

  it('names a Director of Studies once', async () => {
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    await service.add('tch-aline', { role: 'DOS' });
    prisma.teacherRole.findFirst.mockResolvedValue({ id: 'duty-1' });
    await expect(service.add('tch-aline', { role: 'DOS' })).rejects.toThrow(
      'already Director of Studies',
    );
  });

  it('refuses a teacher who has left', async () => {
    prisma.teacher.findFirst.mockResolvedValue({
      id: 'tch-aline',
      user: { isActive: false },
    });
    await expect(service.add('tch-aline', { role: 'DOS' })).rejects.toThrow(
      'has left',
    );
  });

  it("ends only this teacher's own duty", async () => {
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    await expect(service.remove('tch-aline', 'duty-9')).rejects.toThrow(
      'Duty not found',
    );
    expect(prisma.teacherRole.findFirst.mock.calls[0][0].where).toEqual({
      id: 'duty-9',
      teacherId: 'tch-aline',
    });
  });
});
