import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/dashboard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin dashboard overview' })
  getAdminDashboard(
    @Query('academicYearId') academicYearId?: string,
    @Query('termId') termId?: string,
  ) {
    return this.service.getAdminDashboard(academicYearId, termId);
  }

  @Get('admin/performance-trends')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Performance trends across terms' })
  getPerformanceTrends(@Query('academicYearId') academicYearId: string) {
    return this.service.getPerformanceTrends(academicYearId);
  }

  @Get('admin/class-comparisons')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Compare class performances' })
  getClassComparisons(@Query('termId') termId: string) {
    return this.service.getClassComparisons(termId);
  }

  @Get('admin/discipline')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Discipline statistics' })
  getDisciplineStats(@Query('academicYearId') academicYearId?: string) {
    return this.service.getDisciplineStats(academicYearId);
  }

  @Get('admin/library')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Library usage statistics' })
  getLibraryStats() {
    return this.service.getLibraryStats();
  }

  @Get('admin/attendance')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Attendance statistics' })
  getAttendanceStats(@Query('termId') termId?: string) {
    return this.service.getAttendanceStats(termId);
  }

  // ── Teacher ───────────────────────────────────────────────────────────────

  @Get('teacher/class/:classSectionId')
  @Roles('TEACHER')
  @ApiOperation({ summary: 'Class analytics for teacher' })
  getTeacherClassAnalytics(
    @Req() req: any,
    @Param('classSectionId', ParseUUIDPipe) classSectionId: string,
    @Query('termId') termId: string,
  ) {
    return this.service.getTeacherClassAnalytics(
      req.user.teacherId,
      classSectionId,
      termId,
    );
  }

  // ── Student ───────────────────────────────────────────────────────────────

  @Get('student/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Student performance analytics' })
  getStudentAnalytics(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
  ) {
    return this.service.getStudentAnalytics(studentId, termId);
  }

  // ── Parent ────────────────────────────────────────────────────────────────

  @Get('parent/child/:studentId/trends')
  @Roles('PARENT')
  @ApiOperation({ summary: 'Child performance trends for parent' })
  getParentChildTrends(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return this.service.getParentChildTrends(studentId, academicYearId);
  }
}
