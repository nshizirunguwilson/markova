import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LibraryService } from '../modules/library/library.service';
import { AttendanceService } from '../modules/attendance/attendance.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly libraryService: LibraryService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /** Daily at 8 AM - remind borrowers of books due within 2 days */
  @Cron('0 8 * * *')
  async handleLibraryDueReminders() {
    this.logger.log('Running library due reminders...');
    try {
      const result = await this.libraryService.sendDueReminders();
      this.logger.log(`Library due reminders sent: ${result.sent}`);
    } catch (error) {
      this.logger.error(
        'Failed to send library due reminders',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Monday at 9 AM - alert parents of chronically absent students */
  @Cron('0 9 * * 1')
  async handleChronicAbsenteeismAlerts() {
    this.logger.log('Running chronic absenteeism alerts...');
    try {
      const result =
        await this.attendanceService.sendChronicAbsenteeismAlerts();
      this.logger.log(
        `Chronic absenteeism alerts: ${result.studentsIdentified} students identified, ${result.alertsSent} alerts sent`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to send chronic absenteeism alerts',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
