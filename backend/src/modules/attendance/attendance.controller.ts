import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import {
  MarkAttendanceDto,
  QrScanDto,
  BulkAttendanceDto,
  MarkTeacherAttendanceDto,
  TeacherQrScanDto,
  QueryAttendanceDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@Controller('attendance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // ── Student Attendance ──────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Mark single student attendance' })
  markAttendance(@Body() dto: MarkAttendanceDto, @CurrentUser() user: any) {
    return this.service.markAttendance(dto, user.id);
  }

  @Post('bulk')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Bulk mark attendance for a class' })
  bulkMark(@Body() dto: BulkAttendanceDto, @CurrentUser() user: any) {
    return this.service.bulkMarkAttendance(dto, user.id);
  }

  @Post('qr-scan')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Process student QR scan' })
  qrScan(@Body() dto: QrScanDto, @CurrentUser() user: any) {
    return this.service.processQrScan(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Query attendance records' })
  findAll(@Query() query: QueryAttendanceDto) {
    return this.service.findAll(query);
  }

  @Get('class')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get class attendance for a date' })
  getClassAttendance(
    @Query('classSectionId') classSectionId: string,
    @Query('date') date: string,
  ) {
    return this.service.getClassAttendance(classSectionId, date);
  }

  // ── Student Summary ─────────────────────────────────────────────────────

  @Get('student-summary')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get student attendance summary' })
  getStudentSummary(
    @Query('studentId') studentId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getStudentSummary(studentId, dateFrom, dateTo);
  }

  // ── Teacher Attendance ──────────────────────────────────────────────────

  @Post('teacher')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Mark teacher attendance' })
  markTeacherAttendance(@Body() dto: MarkTeacherAttendanceDto) {
    return this.service.markTeacherAttendance(dto);
  }

  @Post('teacher/qr-scan')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Process teacher QR scan' })
  teacherQrScan(@Body() dto: TeacherQrScanDto) {
    return this.service.processTeacherQrScan(dto);
  }

  @Get('teacher')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get teacher attendance for a date' })
  getTeacherAttendance(@Query('date') date: string) {
    return this.service.getTeacherAttendance(date);
  }

  // ── Chronic Absenteeism ─────────────────────────────────────────────────

  @Get('chronic')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get chronically absent students' })
  getChronic(
    @Query('classSectionId') classSectionId?: string,
    @Query('threshold') threshold?: string,
  ) {
    return this.service.getChronicallyAbsent(classSectionId, threshold ? Number(threshold) : undefined);
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get real-time attendance dashboard data' })
  getDashboard(@Query('date') date?: string) {
    return this.service.getDashboardData(date);
  }
}
