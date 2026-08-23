import { ScheduledTasksService } from './scheduled-tasks.service';

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

  const build = () => {
    const service = new ScheduledTasksService(library, attendance);
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
    const error = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();
    return { service, log, error };
  };

  beforeEach(() => {
    library.sendDueReminders.mockReset().mockResolvedValue({ sent: 12 });
    attendance.sendChronicAbsenteeismAlerts
      .mockReset()
      .mockResolvedValue({ studentsIdentified: 4, alertsSent: 7 });
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

      await expect(service.handleLibraryDueReminders()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        'Failed to send library due reminders',
        boom.stack,
      );
    });

    it('copes with something thrown that is not an error', async () => {
      library.sendDueReminders.mockRejectedValue('nope');
      const { service, error } = build();
      await service.handleLibraryDueReminders();
      expect(error).toHaveBeenCalledWith(
        'Failed to send library due reminders',
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
        'Failed to send chronic absenteeism alerts',
        boom.stack,
      );
    });

    it('copes with something thrown that is not an error', async () => {
      attendance.sendChronicAbsenteeismAlerts.mockRejectedValue('nope');
      const { service, error } = build();
      await service.handleChronicAbsenteeismAlerts();
      expect(error).toHaveBeenCalledWith(
        'Failed to send chronic absenteeism alerts',
        undefined,
      );
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
