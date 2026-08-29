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
import { SubjectScope } from '@prisma/client';
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
  CreateTradeDto,
  UpdateTradeDto,
  CreateAssessmentTypeDto,
  CreateAssignmentDto,
  BulkAssignmentDto,
  PromoteStudentsDto,
  PromotionPreviewDto,
  CommitPromotionDto,
  CreateTimetableDto,
  UpdateTimetableDto,
  BulkTimetableDto,
  CreateExamScheduleDto,
  UpdateExamScheduleDto,
  BulkExamScheduleDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { gradingExplained } from '../../common/grading-explained';
import { RolesGuard } from '../../common/guards';

// Read-only reference data (academic calendar, subjects, sections, etc.) is
// needed by every role to populate term/year selectors and labels. Writes stay
// ADMIN-only; only the GET handlers below use this.
const ALL_ROLES = [
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'LIBRARIAN',
  // The bursar's every screen is "this term, this class", so the calendar is
  // vocabulary they cannot work without.
  'BURSAR',
] as const;

@ApiTags('Academic')
@Controller('academic')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AcademicController {
  constructor(private readonly service: AcademicService) {}

  /**
   * How a mark becomes a grade.
   *
   * Reference material rather than a record, so it takes no parameters and
   * touches no table. Open to every role because everybody it explains
   * things to has to be able to read it: a parent asking why 68% is a B, a
   * student working out what an aggregate is, a new teacher checking which
   * scale an elective is marked on.
   */
  @Get('grading-scale')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'How marks, grades, aggregates and conduct work' })
  gradingScale() {
    return gradingExplained();
  }

  // ─── ACADEMIC YEARS ─────────────────────────────────────────────────────────

  @Get('years')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List all academic years' })
  findAllYears() {
    return this.service.findAllYears();
  }

  @Get('years/:id')
  @Roles(...ALL_ROLES)
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
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List all terms (optionally filter by year)' })
  findAllTerms(@Query('academicYearId') academicYearId?: string) {
    return this.service.findAllTerms(academicYearId);
  }

  @Get('terms/:id')
  @Roles(...ALL_ROLES)
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

  /**
   * The school's own list of classes. Read-only, and not academic data -
   * it is the vocabulary every page uses to filter by class.
   *
   * The boarding staff and the nurse need it for exactly that: the pocket
   * money register and the activity list are both filtered by class, and
   * without this their filters came back empty behind a "Forbidden resource"
   * toast. Writing a class stays with the administrator below.
   */
  @Get('class-levels')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'NURSE', 'LIBRARIAN', 'BURSAR')
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

  // ─── TRADES (A-LEVEL TVET SECTIONS) ─────────────────────────────────────────

  @Get('trades')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List all trades with class/module counts' })
  findAllTrades() {
    return this.service.findAllTrades();
  }

  @Post('trades')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create trade' })
  createTrade(@Body() dto: CreateTradeDto) {
    return this.service.createTrade(dto);
  }

  @Put('trades/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update trade' })
  updateTrade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTradeDto,
  ) {
    return this.service.updateTrade(id, dto);
  }

  @Delete('trades/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete trade (blocked while it has classes)' })
  deleteTrade(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTrade(id);
  }

  // ─── CLASS SECTIONS ─────────────────────────────────────────────────────────

  /** As above: the vocabulary, not the marks. */
  @Get('sections')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'NURSE', 'LIBRARIAN', 'BURSAR')
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
  findAllSubjects(
    @Query('scope') scope?: string,
    @Query('tradeId') tradeId?: string,
    @Query('classLevelId') classLevelId?: string,
  ) {
    const validScope = Object.values(SubjectScope).includes(
      scope as SubjectScope,
    )
      ? (scope as SubjectScope)
      : undefined;
    return this.service.findAllSubjects({
      scope: validScope,
      tradeId,
      classLevelId,
    });
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

  @Post('promote/preview')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Deliberation preview: per-student average, discipline, recommendation',
  })
  promotionPreview(@Body() dto: PromotionPreviewDto) {
    return this.service.getPromotionPreview(dto);
  }

  @Post('promote/commit')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Commit staff-reviewed promotion decisions' })
  commitPromotion(@Body() dto: CommitPromotionDto) {
    return this.service.commitPromotion(dto);
  }
}
