import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import * as express from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { OwnershipService } from '../../common/ownership.service';
import { FeeGateService } from '../../common/fee-gate.service';
import {
  GenerateClassReportCardsDto,
  GenerateDocumentDto,
  BulkIdCardsDto,
  IssueIdCardDto,
  IdCardRegistryQueryDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly ownership: OwnershipService,
    private readonly feeGate: FeeGateService,
  ) {}

  // ── Report Cards ────────────────────────────────────────────────────────

  /**
   * Ownership, then timing, then fees.
   *
   * Whose child it is has always been checked. Whether the school has issued
   * the card was not - so a student could read their report card, as data, as
   * HTML or as a PDF, before it was released. Staff are never gated: they
   * have to read the thing before issuing it.
   *
   * The fee check comes last and is deliberately separate from the issuing
   * one, because the two say different things to a family. "Not issued yet"
   * is the school still working; "held until the fees are settled" is
   * something they can act on, and the message names the amount so they can.
   */
  private async assertMayRead(
    user: { id: string; role: string },
    studentId: string,
    termId: string,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    if (user.role !== 'STUDENT' && user.role !== 'PARENT') return;

    const issued = await this.service.isReportCardIssued(studentId, termId);
    if (!issued) {
      throw new ForbiddenException(
        'This report card has not been issued yet. It will appear here once the school releases it.',
      );
    }

    await this.feeGate.assertReleased(user.role, studentId, termId);
  }

  /**
   * The same, for the annual report.
   *
   * An annual report is the three terms added up, so it is held while any of
   * them is owed on. Whether the year's report has been "issued" is not a
   * separate state the way a term card's is - it is built from term results
   * that were issued one by one - so ownership and fees are the two checks.
   */
  private async assertMayReadYear(
    user: { id: string; role: string },
    studentId: string,
    academicYearId: string,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    await this.feeGate.assertYearReleased(user.role, studentId, academicYearId);
  }

  @Get('term/:studentId')
  // Bulk class downloads fetch these one per student; a dedicated budget
  // keeps them from tripping the app-wide 100 req/min limit.
  @Throttle({ default: { ttl: 60000, limit: 240 } })
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get term report card data' })
  async getTermReport(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId', ParseUUIDPipe) termId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertMayRead(user, studentId, termId);
    return this.service.getTermReportData(studentId, termId);
  }

  @Get('term/:studentId/html')
  // Bulk class downloads fetch these one per student; a dedicated budget
  // keeps them from tripping the app-wide 100 req/min limit.
  @Throttle({ default: { ttl: 60000, limit: 240 } })
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get term report card as HTML' })
  async getTermReportHtml(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId', ParseUUIDPipe) termId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertMayRead(user, studentId, termId);
    return this.service.generateTermReportHtml(studentId, termId);
  }

  @Get('term/:studentId/pdf')
  // Bulk class downloads fetch these one per student; a dedicated budget
  // keeps them from tripping the app-wide 100 req/min limit.
  @Throttle({ default: { ttl: 60000, limit: 240 } })
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Download term report card as PDF' })
  async getTermReportPdf(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId', ParseUUIDPipe) termId: string,
    @Res() res: express.Response,
    @CurrentUser() user: any,
  ) {
    await this.assertMayRead(user, studentId, termId);
    const pdf = await this.service.generateTermReportPdf(studentId, termId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-card-${studentId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Post('term/class')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate report cards for a class' })
  generateClassReports(@Body() dto: GenerateClassReportCardsDto) {
    return this.service.generateClassReportCards(
      dto.classSectionId,
      dto.termId,
    );
  }

  @Get('year/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get year report data' })
  async getYearReport(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertMayReadYear(user, studentId, academicYearId);
    return this.service.getYearReportData(studentId, academicYearId);
  }

  @Get('year/:studentId/html')
  // Bulk class downloads fetch these one per student, like the term cards.
  @Throttle({ default: { ttl: 60000, limit: 240 } })
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get the annual report as HTML' })
  async getYearReportHtml(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertMayReadYear(user, studentId, academicYearId);
    return this.service.generateYearReportHtml(studentId, academicYearId);
  }

  @Get('year/:studentId/pdf')
  @Throttle({ default: { ttl: 60000, limit: 240 } })
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Download the annual report as PDF' })
  async getYearReportPdf(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Res() res: express.Response,
    @CurrentUser() user: any,
  ) {
    await this.assertMayReadYear(user, studentId, academicYearId);
    const pdf = await this.service.generateYearReportPdf(
      studentId,
      academicYearId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="annual-report-${studentId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  // ── Documents ───────────────────────────────────────────────────────────

  @Post('document')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Generate a document (transfer letter, transcript, etc.)',
  })
  generateDocument(@Body() dto: GenerateDocumentDto) {
    return this.service.generateDocument(dto.studentId, dto.type);
  }

  @Post('document/pdf')
  @Roles('ADMIN')
  // Rendering a letter launches a page in the shared Chrome instance, the same
  // as a report card, so it gets the same budget rather than the app-wide one.
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Download a document as an A4 PDF' })
  async generateDocumentPdf(
    @Body() dto: GenerateDocumentDto,
    @Res() res: express.Response,
  ) {
    const { pdf, title } = await this.service.generateDocumentPdf(
      dto.studentId,
      dto.type,
    );
    res.set({
      'Content-Type': 'application/pdf',
      // The title carries the student's name, so quotes and non-ASCII are
      // both possible; strip what a header cannot hold rather than emitting a
      // filename the browser will refuse.
      'Content-Disposition': `attachment; filename="${title.replace(/[^\w \-.]/g, '')}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  // ── ID Cards ────────────────────────────────────────────────────────────

  @Get('id-card/:studentId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate student ID card data' })
  getIdCard(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.service.generateIdCardData(studentId);
  }

  @Post('id-cards/bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate ID cards for a class' })
  bulkIdCards(@Body() dto: BulkIdCardsDto) {
    return this.service.generateBulkIdCards(dto.classSectionId);
  }

  @Get('id-cards/registry')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List students with their ID-card status' })
  idCardRegistry(@Query() query: IdCardRegistryQueryDto) {
    return this.service.getIdCardRegistry(query);
  }

  @Post('id-cards/issue')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Issue (generate) an ID card for a student' })
  issueIdCard(@Body() dto: IssueIdCardDto) {
    return this.service.issueIdCard(dto.studentId);
  }

  @Post('id-cards/issue-bulk')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Issue cards for all students in a section without one',
  })
  issueBulkIdCards(@Body() dto: BulkIdCardsDto) {
    return this.service.issueBulkIdCards(dto.classSectionId);
  }

  @Post('id-cards/revoke')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Revoke a student ID card permanently, forcing a reprint',
  })
  revokeIdCard(@Body() dto: IssueIdCardDto) {
    return this.service.revokeIdCard(dto.studentId);
  }

  @Post('id-cards/suspend')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Suspend a card temporarily, keeping it usable once restored',
  })
  suspendIdCard(@Body() dto: IssueIdCardDto) {
    return this.service.suspendIdCard(dto.studentId);
  }

  @Post('id-cards/restore')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bring a suspended card back into use' })
  restoreIdCard(@Body() dto: IssueIdCardDto) {
    return this.service.restoreIdCard(dto.studentId);
  }

  // ── Full export ───────────────────────────────────────────────────────────

  @Get('export/dataset/:key')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export one dataset as a readable CSV' })
  async exportDataset(@Param('key') key: string, @Res() res: express.Response) {
    const { filename, csv } = await this.service.exportDatasetCsv(key);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(csv);
  }

  @Get('export/all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export all system data as a ZIP of CSV files' })
  async exportAll(@Res() res: express.Response) {
    const zip = await this.service.exportEverythingZip();
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="markova-export-${date}.zip"`,
      'Content-Length': zip.length,
    });
    res.end(zip);
  }
}
