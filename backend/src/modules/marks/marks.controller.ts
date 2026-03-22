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
import {
  CreateMarkDto,
  UpdateMarkDto,
  BatchMarkEntryDto,
  CalculateTermResultDto,
  CalculateYearResultDto,
  UpdateTermResultCommentDto,
  PublishTermResultsDto,
  QueryMarksDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Marks')
@Controller('marks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class MarksController {
  constructor(
    private readonly service: MarksService,
    private readonly ownership: OwnershipService,
  ) {}

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
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Query marks with filters' })
  findAll(@Query() query: QueryMarksDto) {
    return this.service.findAll(query);
  }

  @Get('completion')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get grading completion tracker' })
  getCompletion(
    @Query('classSectionId') classSectionId: string,
    @Query('termId') termId: string,
    @Query('subjectId') subjectId: string,
    @Query('assessmentTypeId') assessmentTypeId: string,
  ) {
    return this.service.getCompletionTracker(classSectionId, termId, subjectId, assessmentTypeId);
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
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMarkDto, @CurrentUser() user: any) {
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
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get term results for a class' })
  getTermResults(
    @Query('classSectionId') classSectionId: string,
    @Query('termId') termId: string,
  ) {
    return this.service.getTermResults(classSectionId, termId);
  }

  @Get('term-results/student/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get term result for a student' })
  async getStudentTermResult(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getStudentTermResult(studentId, termId);
  }

  @Put('term-results/:id/comment')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update teacher/headmaster comment on term result' })
  updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermResultCommentDto,
  ) {
    return this.service.updateTermResultComment(id, dto);
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
  @Roles('ADMIN', 'TEACHER')
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
    return this.service.getStudentYearResult(studentId, academicYearId);
  }

  // ── Report Card ─────────────────────────────────────────────────────────

  @Get('report-card/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get full report card data for a student' })
  async getReportCard(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getReportCardData(studentId, termId);
  }
}
