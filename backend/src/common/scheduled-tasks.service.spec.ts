import { ScheduledTasksService } from './scheduled-tasks.service';
import { currentRequest } from '../prisma/request-context';

/**
 * The jobs that run without anybody asking.
 *
 * Nobody watches these. The only thing that makes them trustworthy is that a
 * failure is logged rather than swallowed, and that one job failing does not
 * take the process down and stop the others ever running again.
 */
describe('ScheduledTasksService', () => {
  const library = { sendDueReminders: jest.fn() } as any;
  const attendance = { sendChronicAbsenteeismAlerts: jest.fn() } as any;
  const prisma = { school: { findMany: jest.fn() } } as any;
  const sharing = { greetNewAdults: jest.fn() } as any;

  const build = () => {
    const service = new ScheduledTasksService(
      library,
      attendance,
      prisma,
      sharing,
    );
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
    const error = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();
    return { service, log, error };
  };

  beforeEach(() => {
    prisma.school.findMany
      .mockReset()
      .mockResolvedValue([{ id: 'school-1', slug: 'kigali-hill' }]);
    library.sendDueReminders.mockReset().mockResolvedValue({ sent: 12 });
    attendance.sendChronicAbsenteeismAlerts
      .mockReset()
      .mockResolvedValue({ studentsIdentified: 4, alertsSent: 7 });
  });

  describe('eighteenth birthdays', () => {
    it('greets each school’s students turning 18, school by school', async () => {
      sharing.greetNewAdults.mockReset().mockResolvedValue({ greeted: 2 });
      const { service, log } = build();
      await service.handleEighteenthBirthdays();
      expect(sharing.greetNewAdults).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Students turning 18 today: 2');
    });

    it('logs a school that fails rather than stopping', async () => {
      sharing.greetNewAdults.mockReset().mockRejectedValue(new Error('down'));
      const { service, error } = build();
      await expect(
        service.handleEighteenthBirthdays(),
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        'Eighteenth birthdays failed for kigali-hill',
        expect.any(String),
      );
    });
  });

  describe('library reminders', () => {
    it('asks the library to remind whoever is due', async () => {
      const { service } = build();
      await service.handleLibraryDueReminders();
      expect(library.sendDueReminders).toHaveBeenCalled();
    });

    it('says how many went out', async () => {
      const { service, log } = build();
      await service.handleLibraryDueReminders();
      expect(log).toHaveBeenCalledWith('Library due reminders sent: 12');
    });

    // A job that throws inside a cron takes nothing with it, and a job that
    // fails silently is worse than one that never ran.
    it('logs a failure instead of throwing out of the job', async () => {
      const boom = new Error('SMTP refused the connection');
      library.sendDueReminders.mockRejectedValue(boom);
      const { service, error } = build();

      await expect(
        service.handleLibraryDueReminders(),
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        'Library due reminders failed for kigali-hill',
        boom.stack,
      );
    });

    it('copes with something thrown that is not an error', async () => {
      library.sendDueReminders.mockRejectedValue('nope');
      const { service, error } = build();
      await service.handleLibraryDueReminders();
      expect(error).toHaveBeenCalledWith(
        'Library due reminders failed for kigali-hill',
        undefined,
      );
    });
  });

  describe('chronic absence alerts', () => {
    it('asks attendance to tell those families', async () => {
      const { service } = build();
      await service.handleChronicAbsenteeismAlerts();
      expect(attendance.sendChronicAbsenteeismAlerts).toHaveBeenCalled();
    });

    it('says how many were found and how many were told', async () => {
      const { service, log } = build();
      await service.handleChronicAbsenteeismAlerts();
      expect(log).toHaveBeenCalledWith(
        'Chronic absenteeism alerts: 4 students identified, 7 alerts sent',
      );
    });

    it('logs a failure instead of throwing out of the job', async () => {
      const boom = new Error('Database unreachable');
      attendance.sendChronicAbsenteeismAlerts.mockRejectedValue(boom);
      const { service, error } = build();

      await expect(
        service.handleChronicAbsenteeismAlerts(),
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        'Chronic absenteeism alerts failed for kigali-hill',
        boom.stack,
      );
    });

    it('copes with something thrown that is not an error', async () => {
      attendance.sendChronicAbsenteeismAlerts.mockRejectedValue('nope');
      const { service, error } = build();
      await service.handleChronicAbsenteeismAlerts();
      expect(error).toHaveBeenCalledWith(
        'Chronic absenteeism alerts failed for kigali-hill',
        undefined,
      );
    });
  });

  /*
    A scheduled job has nobody signed in, and the database shows nothing to a
    query with no school, so each job runs once per school, inside it.
  */
  describe('many schools', () => {
    beforeEach(() => {
      prisma.school.findMany.mockResolvedValue([
        { id: 'school-1', slug: 'kigali-hill' },
        { id: 'school-2', slug: 'lycee-notre-dame' },
      ]);
    });

    it('runs the job once for every active school, inside that school', async () => {
      const seen: (string | undefined)[] = [];
      library.sendDueReminders.mockImplementation(() => {
        seen.push(currentRequest()?.schoolId);
        return Promise.resolve({ sent: 1 });
      });
      const { service } = build();
      await service.handleLibraryDueReminders();
      expect(seen).toEqual(['school-1', 'school-2']);
      expect(prisma.school.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      );
    });

    it('carries on with the next school when one fails', async () => {
      attendance.sendChronicAbsenteeismAlerts
        .mockRejectedValueOnce(new Error('bad record'))
        .mockResolvedValueOnce({ studentsIdentified: 1, alertsSent: 1 });
      const { service, error } = build();
      await service.handleChronicAbsenteeismAlerts();
      expect(attendance.sendChronicAbsenteeismAlerts).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith(
        'Chronic absenteeism alerts failed for kigali-hill',
        expect.any(String),
      );
    });

    it('does nothing when no school is active', async () => {
      prisma.school.findMany.mockResolvedValue([]);
      const { service } = build();
      await service.handleLibraryDueReminders();
      expect(library.sendDueReminders).not.toHaveBeenCalled();
    });
  });

  it('runs each job independently of the other', async () => {
    library.sendDueReminders.mockRejectedValue(new Error('down'));
    const { service } = build();
    await service.handleLibraryDueReminders();
    await service.handleChronicAbsenteeismAlerts();
    expect(attendance.sendChronicAbsenteeismAlerts).toHaveBeenCalled();
  });
});
