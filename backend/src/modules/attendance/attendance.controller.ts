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
import { OwnershipService } from '../../common/ownership.service';
import {
  MarkAttendanceDto,
  QrScanDto,
  BulkAttendanceDto,
  MarkTeacherAttendanceDto,
  TeacherQrScanDto,
  QueryAttendanceDto,
  NfcScanDto,
  RegisterNfcCardDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@Controller('attendance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly ownership: OwnershipService,
  ) {}

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
  async getStudentSummary(
    @Query('studentId') studentId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getStudentSummary(studentId, dateFrom, dateTo);
  }

  // ── NFC Attendance ─────────────────────────────────────────────────────

  @Post('nfc-scan')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Process NFC card scan for attendance' })
  nfcScan(@Body() dto: NfcScanDto, @CurrentUser() user: any) {
    return this.service.processNfcScan(dto, user.id);
  }

  @Post('register-nfc')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Register NFC card to a student' })
  registerNfc(@Body() dto: RegisterNfcCardDto) {
    return this.service.registerNfcCard(dto);
  }

  @Get('class-students')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get class students with NFC card IDs for local cache' })
  getClassStudentsWithNfc(@Query('classSectionId') classSectionId: string) {
    return this.service.getClassStudentsWithNfc(classSectionId);
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

  @Post('chronic/notify')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Send email alerts to parents of chronically absent students' })
  sendChronicAlerts() {
    return this.service.sendChronicAbsenteeismAlerts();
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get real-time attendance dashboard data' })
  getDashboard(@Query('date') date?: string) {
    return this.service.getDashboardData(date);
  }
}
