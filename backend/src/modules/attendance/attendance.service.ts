import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  MarkAttendanceDto,
  QrScanDto,
  BulkAttendanceDto,
  MarkTeacherAttendanceDto,
  TeacherQrScanDto,
  QueryAttendanceDto,
} from './dto';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ATTENDANCE — MANUAL
  // ═══════════════════════════════════════════════════════════════════════════

  async markAttendance(dto: MarkAttendanceDto, markedByUserId: string) {
    // Validate student exists
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    try {
      const record = await this.prisma.attendance.upsert({
        where: {
          studentId_date_type_subjectId: {
            studentId: dto.studentId,
            date: new Date(dto.date),
            type: dto.type,
            subjectId: dto.subjectId || '',
          },
        },
        update: {
          status: dto.status as any,
          reasonCategory: (dto.reasonCategory as any) || null,
          markedByUserId,
        },
        create: {
          studentId: dto.studentId,
          classSectionId: dto.classSectionId,
          date: new Date(dto.date),
          type: dto.type,
          subjectId: dto.subjectId || null,
          status: dto.status as any,
          reasonCategory: (dto.reasonCategory as any) || null,
          markedByUserId,
        },
      });

      // Send SMS for absences
      if (dto.status === 'ABSENT') {
        await this.notifyParentAbsence(dto.studentId, dto.date);
      }

      return record;
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('Attendance already recorded for this student/date/type');
      }
      throw e;
    }
  }

  async bulkMarkAttendance(dto: BulkAttendanceDto, markedByUserId: string) {
    const results = [];
    const absentStudentIds: string[] = [];

    for (const record of dto.records) {
      try {
        const att = await this.prisma.attendance.upsert({
          where: {
            studentId_date_type_subjectId: {
              studentId: record.studentId,
              date: new Date(dto.date),
              type: dto.type,
              subjectId: dto.subjectId || '',
            },
          },
          update: {
            status: record.status as any,
            reasonCategory: (record.reasonCategory as any) || null,
            markedByUserId,
          },
          create: {
            studentId: record.studentId,
            classSectionId: dto.classSectionId,
            date: new Date(dto.date),
            type: dto.type,
            subjectId: dto.subjectId || null,
            status: record.status as any,
            reasonCategory: (record.reasonCategory as any) || null,
            markedByUserId,
          },
        });
        results.push(att);
        if (record.status === 'ABSENT') absentStudentIds.push(record.studentId);
      } catch {
        // Skip duplicates
      }
    }

    // Notify parents of absent students
    for (const studentId of absentStudentIds) {
      await this.notifyParentAbsence(studentId, dto.date);
    }

    return { count: results.length, records: results };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ATTENDANCE — QR SCAN
  // ═══════════════════════════════════════════════════════════════════════════

  async processQrScan(dto: QrScanDto, markedByUserId: string) {
    // Find student by studentIdNumber (QR contains this)
    const student = await this.prisma.student.findFirst({
      where: { studentIdNumber: dto.qrData },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) {
      throw new NotFoundException(`No student found with ID: ${dto.qrData}`);
    }

    // Validate student is in the correct class section
    if (student.classSectionId !== dto.classSectionId) {
      throw new BadRequestException('Student is not in this class section');
    }

    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10));
    const type = dto.type || 'daily';

    // Prevent duplicate scans
    const existing = await this.prisma.attendance.findFirst({
      where: {
        studentId: student.id,
        date: today,
        type,
        subjectId: dto.subjectId || null,
      },
    });
    if (existing) {
      return { duplicate: true, record: existing, student: { name: `${student.user.firstName} ${student.user.lastName}` } };
    }

    // Determine if late (after 8:30 AM for daily)
    const isLate = type === 'daily' && now.getHours() >= 8 && now.getMinutes() > 30;

    const record = await this.prisma.attendance.create({
      data: {
        studentId: student.id,
        classSectionId: dto.classSectionId,
        date: today,
        type,
        subjectId: dto.subjectId || null,
        status: isLate ? 'LATE' : 'PRESENT',
        scannedAt: now,
        markedByUserId,
      },
    });

    return {
      duplicate: false,
      record,
      student: { name: `${student.user.firstName} ${student.user.lastName}` },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEACHER ATTENDANCE
  // ═══════════════════════════════════════════════════════════════════════════

  async markTeacherAttendance(dto: MarkTeacherAttendanceDto) {
    return this.prisma.teacherAttendance.upsert({
      where: {
        teacherId_date: {
          teacherId: dto.teacherId,
          date: new Date(dto.date),
        },
      },
      update: { status: dto.status as any },
      create: {
        teacherId: dto.teacherId,
        date: new Date(dto.date),
        status: dto.status as any,
      },
    });
  }

  async processTeacherQrScan(dto: TeacherQrScanDto) {
    // Find teacher by user ID or some identifier from QR
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        user: { OR: [{ email: dto.qrData }, { phone: dto.qrData }] },
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found from QR data');
    }

    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10));

    const existing = await this.prisma.teacherAttendance.findFirst({
      where: { teacherId: teacher.id, date: today },
    });
    if (existing) {
      return { duplicate: true, record: existing, teacher: { name: `${teacher.user.firstName} ${teacher.user.lastName}` } };
    }

    const isLate = now.getHours() >= 8 && now.getMinutes() > 30;
    const record = await this.prisma.teacherAttendance.create({
      data: {
        teacherId: teacher.id,
        date: today,
        status: isLate ? 'LATE' : 'PRESENT',
        scannedAt: now,
      },
    });

    return { duplicate: false, record, teacher: { name: `${teacher.user.firstName} ${teacher.user.lastName}` } };
  }

  async getTeacherAttendance(date: string) {
    const teachers = await this.prisma.teacher.findMany({
      where: { isActive: true },
      include: {
        user: { select: { firstName: true, lastName: true } },
        teacherAttendances: {
          where: { date: new Date(date) },
        },
      },
    });

    return teachers.map((t) => ({
      teacherId: t.id,
      name: `${t.user.firstName} ${t.user.lastName}`,
      status: t.teacherAttendances[0]?.status || null,
      scannedAt: t.teacherAttendances[0]?.scannedAt || null,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async findAll(query: QueryAttendanceDto) {
    const where: any = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.classSectionId) where.classSectionId = query.classSectionId;
    if (query.type) where.type = query.type;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }

    return this.prisma.attendance.findMany({
      where,
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
        subject: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { student: { user: { firstName: 'asc' } } }],
    });
  }

  async getClassAttendance(classSectionId: string, date: string) {
    const students = await this.prisma.student.findMany({
      where: { classSectionId, status: 'ACTIVE' },
      include: {
        user: { select: { firstName: true, lastName: true } },
        attendances: {
          where: { date: new Date(date), type: 'daily' },
        },
      },
      orderBy: { user: { firstName: 'asc' } },
    });

    const present = students.filter((s) => s.attendances[0]?.status === 'PRESENT').length;
    const late = students.filter((s) => s.attendances[0]?.status === 'LATE').length;
    const absent = students.filter((s) => !s.attendances[0] || s.attendances[0]?.status === 'ABSENT').length;

    return {
      date,
      total: students.length,
      present,
      late,
      absent,
      rate: students.length > 0 ? Math.round(((present + late) / students.length) * 100) : 0,
      students: students.map((s) => ({
        studentId: s.id,
        name: `${s.user.firstName} ${s.user.lastName}`,
        studentIdNumber: s.studentIdNumber,
        status: s.attendances[0]?.status || null,
        scannedAt: s.attendances[0]?.scannedAt || null,
        reasonCategory: s.attendances[0]?.reasonCategory || null,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ATTENDANCE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getStudentSummary(studentId: string, dateFrom?: string, dateTo?: string) {
    const where: any = { studentId, type: 'daily' };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const records = await this.prisma.attendance.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const present = records.filter((r) => r.status === 'PRESENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const total = records.length;

    return {
      total,
      present,
      late,
      absent,
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      records: records.map((r) => ({
        date: r.date,
        status: r.status,
        reasonCategory: r.reasonCategory,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHRONIC ABSENTEEISM
  // ═══════════════════════════════════════════════════════════════════════════

  async getChronicallyAbsent(classSectionId?: string, threshold?: number) {
    const absenceThreshold = threshold || 20; // Default: 20% absence rate

    // Get all active students
    const where: any = { status: 'ACTIVE' as any };
    if (classSectionId) where.classSectionId = classSectionId;

    const students = await this.prisma.student.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        classSection: { include: { classLevel: true } },
        attendances: { where: { type: 'daily' } },
      },
    });

    const chronic = students
      .map((s) => {
        const total = s.attendances.length;
        const absent = s.attendances.filter((a) => a.status === 'ABSENT').length;
        const rate = total > 0 ? Math.round((absent / total) * 100) : 0;
        return {
          studentId: s.id,
          name: `${s.user.firstName} ${s.user.lastName}`,
          studentIdNumber: s.studentIdNumber,
          class: `${s.classSection.classLevel.name} ${s.classSection.name}`,
          totalDays: total,
          absentDays: absent,
          absenceRate: rate,
        };
      })
      .filter((s) => s.absenceRate >= absenceThreshold)
      .sort((a, b) => b.absenceRate - a.absenceRate);

    return { threshold: absenceThreshold, count: chronic.length, students: chronic };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL-TIME DASHBOARD DATA
  // ═══════════════════════════════════════════════════════════════════════════

  async getDashboardData(date?: string) {
    const targetDate = date ? new Date(date) : new Date(new Date().toISOString().slice(0, 10));

    // Get all class sections with attendance stats
    const sections = await this.prisma.classSection.findMany({
      include: {
        classLevel: true,
        students: { where: { status: 'ACTIVE' } },
      },
    });

    const sectionStats = await Promise.all(
      sections.map(async (section) => {
        const totalStudents = section.students.length;
        const attendances = await this.prisma.attendance.findMany({
          where: { classSectionId: section.id, date: targetDate, type: 'daily' },
        });

        const present = attendances.filter((a) => a.status === 'PRESENT').length;
        const late = attendances.filter((a) => a.status === 'LATE').length;
        const absent = totalStudents - present - late;

        return {
          sectionId: section.id,
          className: `${section.classLevel.name} ${section.name}`,
          total: totalStudents,
          present,
          late,
          absent,
          rate: totalStudents > 0 ? Math.round(((present + late) / totalStudents) * 100) : 0,
          marked: attendances.length > 0,
        };
      })
    );

    const totalStudents = sectionStats.reduce((s, c) => s + c.total, 0);
    const totalPresent = sectionStats.reduce((s, c) => s + c.present, 0);
    const totalLate = sectionStats.reduce((s, c) => s + c.late, 0);

    return {
      date: targetDate.toISOString().slice(0, 10),
      overall: {
        totalStudents,
        present: totalPresent,
        late: totalLate,
        absent: totalStudents - totalPresent - totalLate,
        rate: totalStudents > 0 ? Math.round(((totalPresent + totalLate) / totalStudents) * 100) : 0,
      },
      sections: sectionStats,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async notifyParentAbsence(studentId: string, date: string) {
    // Find parent links
    const parentLinks = await this.prisma.parentStudent.findMany({
      where: { studentId },
      include: {
        parent: { select: { phone: true, email: true, firstName: true } },
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    const studentName = parentLinks[0]
      ? `${parentLinks[0].student.user.firstName} ${parentLinks[0].student.user.lastName}`
      : 'your child';
    const title = 'Student Absence Alert';

    for (const link of parentLinks) {
      const message = `Dear ${link.parent.firstName}, your child ${studentName} was marked absent on ${date}.`;

      // Send SMS notification
      if (link.parent.phone) {
        try {
          await this.notifications.send({
            userId: link.parentUserId,
            type: 'SMS',
            title,
            message,
          });
        } catch {
          // Non-critical, don't fail the attendance operation
        }
      }

      // Send EMAIL notification
      if (link.parent.email) {
        try {
          await this.notifications.send({
            userId: link.parentUserId,
            type: 'EMAIL',
            title,
            message,
            relatedEntityType: 'attendance',
          });
        } catch {
          // Non-critical, don't fail the attendance operation
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHRONIC ABSENTEEISM ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  async sendChronicAbsenteeismAlerts() {
    const { students, threshold } = await this.getChronicallyAbsent();
    let alertsSent = 0;

    for (const student of students) {
      // Find parent links for each chronically absent student
      const parentLinks = await this.prisma.parentStudent.findMany({
        where: { studentId: student.studentId },
        include: {
          parent: { select: { email: true, firstName: true } },
        },
      });

      for (const link of parentLinks) {
        if (!link.parent.email) continue;

        const message =
          `Dear ${link.parent.firstName}, this is to inform you that your child <strong>${student.name}</strong> ` +
          `(${student.class}) has been identified as chronically absent. ` +
          `They have been absent <strong>${student.absentDays}</strong> out of <strong>${student.totalDays}</strong> school days, ` +
          `resulting in an absence rate of <strong>${student.absenceRate}%</strong> (threshold: ${threshold}%). ` +
          `<br><br>Please contact the school administration to discuss how we can support your child's attendance.`;

        try {
          await this.notifications.send({
            userId: link.parentUserId,
            type: 'EMAIL',
            title: 'Chronic Absenteeism Alert',
            message,
            relatedEntityType: 'attendance',
            relatedEntityId: student.studentId,
          });
          alertsSent++;
        } catch {
          // Log but continue with remaining alerts
        }
      }
    }

    return {
      threshold,
      studentsIdentified: students.length,
      alertsSent,
    };
  }
}
