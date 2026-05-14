import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcademicService } from './academic.service';
import {
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  CreateTermDto,
  UpdateTermDto,
  CreateClassLevelDto,
  UpdateClassLevelDto,
  CreateClassSectionDto,
  UpdateClassSectionDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateAssessmentTypeDto,
  CreateAssignmentDto,
  BulkAssignmentDto,
  PromoteStudentsDto,
  CreateTimetableDto,
  UpdateTimetableDto,
  BulkTimetableDto,
  CreateExamScheduleDto,
  UpdateExamScheduleDto,
  BulkExamScheduleDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Academic')
@Controller('academic')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AcademicController {
  constructor(private readonly service: AcademicService) {}

  // ─── ACADEMIC YEARS ─────────────────────────────────────────────────────────

  @Get('years')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all academic years' })
  findAllYears() {
    return this.service.findAllYears();
  }

  @Get('years/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get academic year by ID' })
  findYearById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findYearById(id);
  }

  @Post('years')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create academic year' })
  createYear(@Body() dto: CreateAcademicYearDto) {
    return this.service.createYear(dto);
  }

  @Put('years/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update academic year' })
  updateYear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.service.updateYear(id, dto);
  }

  @Delete('years/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete academic year' })
  deleteYear(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteYear(id);
  }

  // ─── TERMS ──────────────────────────────────────────────────────────────────

  @Get('terms')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all terms (optionally filter by year)' })
  findAllTerms(@Query('academicYearId') academicYearId?: string) {
    return this.service.findAllTerms(academicYearId);
  }

  @Get('terms/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get term by ID' })
  findTermById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findTermById(id);
  }

  @Post('terms')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create term' })
  createTerm(@Body() dto: CreateTermDto) {
    return this.service.createTerm(dto);
  }

  @Put('terms/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update term' })
  updateTerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermDto,
  ) {
    return this.service.updateTerm(id, dto);
  }

  @Post('terms/:id/close')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Close term (locks marks)' })
  closeTerm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.closeTerm(id);
  }

  @Post('terms/:id/reopen')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reopen closed term' })
  reopenTerm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.reopenTerm(id);
  }

  @Delete('terms/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete term' })
  deleteTerm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTerm(id);
  }

  // ─── CLASS LEVELS ───────────────────────────────────────────────────────────

  @Get('class-levels')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List all class levels with sections' })
  findAllClassLevels() {
    return this.service.findAllClassLevels();
  }

  @Post('class-levels')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create class level' })
  createClassLevel(@Body() dto: CreateClassLevelDto) {
    return this.service.createClassLevel(dto);
  }

  @Put('class-levels/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update class level' })
  updateClassLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassLevelDto,
  ) {
    return this.service.updateClassLevel(id, dto);
  }

  @Delete('class-levels/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete class level' })
  deleteClassLevel(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteClassLevel(id);
  }

  // ─── CLASS SECTIONS ─────────────────────────────────────────────────────────

  @Get('sections')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List all class sections' })
  findAllSections(@Query('classLevelId') classLevelId?: string) {
    return this.service.findAllSections(classLevelId);
  }

  @Post('sections')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create class section' })
  createSection(@Body() dto: CreateClassSectionDto) {
    return this.service.createSection(dto);
  }

  @Put('sections/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update class section' })
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassSectionDto,
  ) {
    return this.service.updateSection(id, dto);
  }

  @Delete('sections/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete class section' })
  deleteSection(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSection(id);
  }

  // ─── SUBJECTS ───────────────────────────────────────────────────────────────

  @Get('subjects')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List all subjects' })
  findAllSubjects() {
    return this.service.findAllSubjects();
  }

  @Post('subjects')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create subject' })
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.service.createSubject(dto);
  }

  @Put('subjects/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update subject' })
  updateSubject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.service.updateSubject(id, dto);
  }

  @Delete('subjects/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete subject' })
  deleteSubject(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSubject(id);
  }

  // ─── ASSESSMENT TYPES ───────────────────────────────────────────────────────

  @Get('assessment-types')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List all assessment types' })
  findAllAssessmentTypes() {
    return this.service.findAllAssessmentTypes();
  }

  @Post('assessment-types')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create assessment type' })
  createAssessmentType(@Body() dto: CreateAssessmentTypeDto) {
    return this.service.createAssessmentType(dto);
  }

  @Delete('assessment-types/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete assessment type' })
  deleteAssessmentType(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAssessmentType(id);
  }

  // ─── TEACHER-SUBJECT-CLASS ASSIGNMENTS ──────────────────────────────────────

  @Get('assignments')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List teacher-subject-class assignments' })
  findAllAssignments(
    @Query('teacherId') teacherId?: string,
    @Query('classSectionId') classSectionId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.service.findAllAssignments({
      teacherId,
      classSectionId,
      academicYearId,
    });
  }

  @Post('assignments')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create teacher-subject-class assignment' })
  createAssignment(@Body() dto: CreateAssignmentDto) {
    return this.service.createAssignment(dto);
  }

  @Post('assignments/bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk create assignments' })
  bulkCreateAssignments(@Body() dto: BulkAssignmentDto) {
    return this.service.bulkCreateAssignments(dto);
  }

  @Delete('assignments/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete assignment' })
  deleteAssignment(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAssignment(id);
  }

  // ─── TIMETABLE ─────────────────────────────────────────────────────────────

  @Get('timetable')
  @Roles('ADMIN', 'TEACHER', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: 'Get timetable for a class section' })
  findTimetable(
    @Query('classSectionId', ParseUUIDPipe) classSectionId: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.service.findTimetable(classSectionId, teacherId);
  }

  @Get('timetable/teacher/:teacherId')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get timetable for a specific teacher' })
  findTeacherTimetable(@Param('teacherId', ParseUUIDPipe) teacherId: string) {
    return this.service.findTeacherTimetable(teacherId);
  }

  @Post('timetable')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a timetable entry' })
  createTimetable(@Body() dto: CreateTimetableDto) {
    return this.service.createTimetable(dto);
  }

  @Put('timetable/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a timetable entry' })
  updateTimetable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimetableDto,
  ) {
    return this.service.updateTimetable(id, dto);
  }

  @Delete('timetable/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a timetable entry' })
  deleteTimetable(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTimetable(id);
  }

  @Post('timetable/bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk create timetable entries' })
  bulkCreateTimetable(@Body() dto: BulkTimetableDto) {
    return this.service.bulkCreateTimetable(dto);
  }

  // ─── EXAM SCHEDULES ──────────────────────────────────────────────────────────

  @Get('exams')
  @Roles('ADMIN', 'TEACHER', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: 'Get exam schedules' })
  findExamSchedules(
    @Query('classSectionId') classSectionId?: string,
    @Query('termId') termId?: string,
  ) {
    return this.service.findExamSchedules(classSectionId, termId);
  }

  @Post('exams')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create exam schedule entry' })
  createExamSchedule(@Body() dto: CreateExamScheduleDto) {
    return this.service.createExamSchedule(dto);
  }

  @Put('exams/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update exam schedule entry' })
  updateExamSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamScheduleDto,
  ) {
    return this.service.updateExamSchedule(id, dto);
  }

  @Delete('exams/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete exam schedule entry' })
  deleteExamSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteExamSchedule(id);
  }

  @Post('exams/bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk create exam schedule entries' })
  bulkCreateExamSchedules(@Body() dto: BulkExamScheduleDto) {
    return this.service.bulkCreateExamSchedules(dto);
  }

  // ─── STUDENT PROMOTION ──────────────────────────────────────────────────────

  @Post('promote')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Auto-promote students based on yearly average threshold',
  })
  promoteStudents(@Body() dto: PromoteStudentsDto) {
    return this.service.promoteStudents(dto);
  }
}
