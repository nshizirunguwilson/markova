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
import { MarksService } from './marks.service';
import { OwnershipService } from '../../common/ownership.service';
import { FeeGateService } from '../../common/fee-gate.service';
import {
  CreateMarkDto,
  UpdateMarkDto,
  BatchMarkEntryDto,
  CalculateTermResultDto,
  CalculateYearResultDto,
  UpdateTermResultCommentDto,
  PublishTermResultsDto,
  ConfirmReportCardsDto,
  PublishReportCardsDto,
  QueryMarksDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HeadTeacherDashboardService } from './head-teacher-dashboard.service';

@ApiTags('Marks')
@Controller('marks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class MarksController {
  constructor(
    private readonly service: MarksService,
    private readonly ownership: OwnershipService,
    private readonly dashboard: HeadTeacherDashboardService,
    private readonly feeGate: FeeGateService,
  ) {}

  /*
    Results held over unpaid fees are reported, not refused.

    These three endpoints are what a student's own marks page is built from,
    and a 403 there is a dead end: the page has nothing to draw and the family
    is told only that they are blocked. Answering with `withheld` instead lets
    the page say which term it is, how much is outstanding and where to go
    about it.

    The report and PDF endpoints in the reports controller do refuse, because
    a download has no page to render an explanation into and handing over a
    file is exactly what must not happen.
  */

  // ── Mark CRUD ───────────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Create a single mark' })
  create(@Body() dto: CreateMarkDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.teacherId, user.role);
  }

  @Post('batch')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Batch entry of marks for a class' })
  batchEntry(@Body() dto: BatchMarkEntryDto, @CurrentUser() user: any) {
    return this.service.batchEntry(dto, user.teacherId, user.role);
  }

  @Get()
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Query marks with filters' })
  findAll(@Query() query: QueryMarksDto) {
    return this.service.findAll(query);
  }

  @Get('completion')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Get grading completion tracker' })
  getCompletion(
    @Query('classSectionId') classSectionId: string,
    @Query('termId') termId: string,
    @Query('subjectId') subjectId: string,
    @Query('assessmentTypeId') assessmentTypeId: string,
  ) {
    return this.service.getCompletionTracker(
      classSectionId,
      termId,
      subjectId,
      assessmentTypeId,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get a single mark by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update a mark' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarkDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.teacherId, user.role);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Delete a mark' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.delete(id, user.teacherId, user.role);
  }

  // ── Term Results ────────────────────────────────────────────────────────

  @Post('term-results/calculate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Calculate term results for a class' })
  calculateTermResults(@Body() dto: CalculateTermResultDto) {
    return this.service.calculateTermResults(dto);
  }

  @Get('term-results/class')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Get term results for a class' })
  getTermResults(
    @Query('classSectionId') classSectionId: string,
    @Query('termId') termId: string,
  ) {
    return this.service.getTermResults(classSectionId, termId);
  }

  @Get('term-results/student/:studentId')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get term result for a student' })
  async getStudentTermResult(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    const withheld = await this.feeGate.withholdingFor(
      user.role,
      studentId,
      termId,
    );
    if (withheld) return { withheld };
    // The role decides whether unpublished figures come back at all.
    return this.service.getStudentTermResult(studentId, termId, user.role);
  }

  @Put('term-results/:id/comment')
  // The head teacher writes one of the two comments, so they reach the same
  // endpoint the class teacher does.
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Update teacher/headmaster comment on term result' })
  updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermResultCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateTermResultComment(id, dto, {
      role: user.role,
      teacherId: user.teacherId,
    });
  }

  /**
   * The classes this person may write report card comments for.
   *
   * A class teacher's own class and no other. Asked for rather than filtered
   * on the screen, so the picker never offers a class the save would refuse.
   */
  @Get('report-cards/classes')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Classes whose report cards you may write on' })
  commentClasses(@CurrentUser() user: any) {
    return this.service.classesForComments({
      role: user.role,
      teacherId: user.teacherId,
    });
  }

  /**
   * What the Director of Studies opens in the morning.
   *
   * The admin may read it too: a principal covering for an absent head
   * teacher needs the same view, and a page only one account in the school
   * can open is a page that goes unread the week they are away.
   */
  @Get('head-teacher/overview')
  @Roles('HEAD_TEACHER', 'ADMIN')
  @ApiOperation({ summary: "The Director of Studies' morning view" })
  headTeacherOverview(@Query('termId') termId?: string) {
    return this.dashboard.overview(termId);
  }

  /**
   * The head teacher standing behind a class's cards, or handing them back.
   *
   * The admin is allowed here as well, because a school where the head
   * teacher is away for a fortnight still has to issue report cards, and a
   * gate nobody can open in an emergency is a gate people learn to route
   * around permanently.
   */
  @Post('report-cards/confirm')
  @Roles('HEAD_TEACHER', 'ADMIN')
  @ApiOperation({
    summary: "Confirm a class's report cards, or hand them back",
  })
  confirmReportCards(
    @Body() dto: ConfirmReportCardsDto,
    @CurrentUser() user: any,
  ) {
    return this.service.confirmReportCards(dto, user.id);
  }

  @Post('report-cards/publish')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Issue or withdraw the report cards for a class',
  })
  publishReportCards(@Body() dto: PublishReportCardsDto) {
    return this.service.publishReportCards(dto);
  }

  @Post('term-results/publish')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Publish or unpublish term results' })
  publishTermResults(@Body() dto: PublishTermResultsDto) {
    return this.service.publishTermResults(dto);
  }

  // ── Year Results ────────────────────────────────────────────────────────

  @Post('year-results/calculate')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Calculate year results for a class' })
  calculateYearResults(@Body() dto: CalculateYearResultDto) {
    return this.service.calculateYearResults(dto);
  }

  @Get('year-results/class')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Get year results for a class' })
  getYearResults(
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return this.service.getYearResults(classSectionId, academicYearId);
  }

  @Get('year-results/student/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get year result for a student' })
  async getStudentYearResult(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    const withheld = await this.feeGate.withholdingForYear(
      user.role,
      studentId,
      academicYearId,
    );
    if (withheld) return { withheld };
    return this.service.getStudentYearResult(studentId, academicYearId);
  }

  // ── Report Card ─────────────────────────────────────────────────────────

  @Get('report-card/:studentId')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get full report card data for a student' })
  async getReportCard(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    // A student or a parent sees the card only once the school has issued it,
    // which is a separate decision from releasing the marks. Staff always see
    // it: they have to read the thing before issuing it.
    if (user.role === 'STUDENT' || user.role === 'PARENT') {
      const issued = await this.service.isReportCardIssued(studentId, termId);
      if (!issued) return { issued: false };
    }
    // Issued, but held: two different things to say, and a family can act on
    // only one of them.
    const withheld = await this.feeGate.withholdingFor(
      user.role,
      studentId,
      termId,
    );
    if (withheld) return { issued: true, withheld };
    const card = await this.service.getReportCardData(studentId, termId);
    return { issued: true, ...card };
  }
}
