import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LibraryService } from '../modules/library/library.service';
import { AttendanceService } from '../modules/attendance/attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { SharingService } from '../modules/sharing/sharing.service';
import { withSchool } from '../prisma/request-context';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly libraryService: LibraryService,
    private readonly attendanceService: AttendanceService,
    private readonly prisma: PrismaService,
    private readonly sharing: SharingService,
  ) {}

  /**
   * Run a job once for every active school, inside that school.
   *
   * A scheduled job has no signed-in person to say which school it is for,
   * and the database shows nothing to a query with no school. So the job runs
   * school by school. One school failing is logged and does not stop the
   * others: a bad record at one school must not cost every other school its
   * reminders.
   */
  private async forEachSchool(
    job: string,
    run: (schoolId: string) => Promise<void>,
  ): Promise<void> {
    const schools = await this.prisma.school.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, slug: true },
    });
    for (const school of schools) {
      try {
        await withSchool(school.id, () => run(school.id));
      } catch (error) {
        this.logger.error(
          `${job} failed for ${school.slug}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /** Daily at 8 AM - remind borrowers of books due within 2 days */
  @Cron('0 8 * * *')
  async handleLibraryDueReminders() {
    this.logger.log('Running library due reminders...');
    await this.forEachSchool('Library due reminders', async () => {
      const result = await this.libraryService.sendDueReminders();
      this.logger.log(`Library due reminders sent: ${result.sent}`);
    });
  }

  /** Daily at 7 AM - tell each student turning 18 that the choice is theirs */
  @Cron('0 7 * * *')
  async handleEighteenthBirthdays() {
    await this.forEachSchool('Eighteenth birthdays', async () => {
      const result = await this.sharing.greetNewAdults();
      this.logger.log(`Students turning 18 today: ${result.greeted}`);
    });
  }

  /** Monday at 9 AM - alert parents of chronically absent students */
  @Cron('0 9 * * 1')
  async handleChronicAbsenteeismAlerts() {
    this.logger.log('Running chronic absenteeism alerts...');
    await this.forEachSchool('Chronic absenteeism alerts', async () => {
      const result =
        await this.attendanceService.sendChronicAbsenteeismAlerts();
      this.logger.log(
        `Chronic absenteeism alerts: ${result.studentsIdentified} students identified, ${result.alertsSent} alerts sent`,
      );
    });
  }
}
