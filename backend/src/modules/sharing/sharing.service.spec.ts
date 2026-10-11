import { SharingService } from './sharing.service';
import { createMockPrisma } from '../../__test__/prisma-mock';
import { asDay } from '../../common/student-standing';

/** A student of 18 choosing what their parents see (A8). */
describe('SharingService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: SharingService;

  const student = (over: Record<string, unknown> = {}) => ({
    id: 'student-1',
    dateOfBirth: asDay('2000-01-01'),
    sharesResults: true,
    sharesConduct: true,
    sharesHealth: true,
    sharingChangedAt: null,
    ...over,
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SharingService(prisma);
    prisma.student.update.mockResolvedValue({});
  });

  it('shows an adult their switches, all on until they choose', async () => {
    prisma.student.findUnique.mockResolvedValue(student());
    await expect(service.mine('user-1')).resolves.toMatchObject({
      adult: true,
      knowsBirthday: true,
      results: true,
      conduct: true,
      health: true,
    });
  });

  it('changes only the switches given, and notes when', async () => {
    prisma.student.findUnique.mockResolvedValue(student());
    await service.change('user-1', { health: false });
    const data = prisma.student.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ sharesHealth: false });
    expect(data).not.toHaveProperty('sharesResults');
    expect(data.sharingChangedAt).toBeInstanceOf(Date);
  });

  it('refuses a student under 18', async () => {
    prisma.student.findUnique.mockResolvedValue(
      student({ dateOfBirth: new Date() }),
    );
    await expect(service.change('user-1', { results: false })).rejects.toThrow(
      /From your 18th birthday/,
    );
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it('refuses when the school does not know the birthday, and says what to do', async () => {
    prisma.student.findUnique.mockResolvedValue(student({ dateOfBirth: null }));
    await expect(service.change('user-1', { results: false })).rejects.toThrow(
      /Ask the office/,
    );
  });

  it('refuses somebody who is not a student', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.mine('user-1')).rejects.toThrow(/No student record/);
    await expect(service.change('user-1', {})).rejects.toThrow(
      /No student record/,
    );
  });

  describe('on an 18th birthday', () => {
    it('tells only the students turning 18 that day', async () => {
      prisma.student.findMany.mockResolvedValue([
        { userId: 'turning', dateOfBirth: asDay('2008-10-12') },
        { userId: 'tomorrow', dateOfBirth: asDay('2008-10-13') },
        { userId: 'older', dateOfBirth: asDay('2007-10-12') },
      ]);
      prisma.notification.create.mockResolvedValue({});
      const result = await service.greetNewAdults(asDay('2026-10-12'));
      expect(result).toEqual({ greeted: 1 });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'turning',
          title: 'Happy 18th birthday',
          relatedEntityType: 'SHARING',
        }),
      });
    });

    it('asks only about students on the roll with a birthday known', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.greetNewAdults(asDay('2026-10-12'));
      expect(prisma.student.findMany.mock.calls[0][0].where).toEqual({
        status: 'ACTIVE',
        dateOfBirth: { not: null },
      });
    });
  });
});
