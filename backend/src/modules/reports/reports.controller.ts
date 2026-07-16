import {
  Controller,
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
import {
  GenerateReportCardDto,
  GenerateClassReportCardsDto,
  GenerateYearReportDto,
  GenerateDocumentDto,
  GenerateIdCardDto,
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
  ) {}

  // ── Report Cards ────────────────────────────────────────────────────────

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
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
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
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
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
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
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
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getYearReportData(studentId, academicYearId);
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
  @ApiOperation({ summary: 'Issue cards for all students in a section without one' })
  issueBulkIdCards(@Body() dto: BulkIdCardsDto) {
    return this.service.issueBulkIdCards(dto.classSectionId);
  }

  @Post('id-cards/revoke')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Revoke a student ID card' })
  revokeIdCard(@Body() dto: IssueIdCardDto) {
    return this.service.revokeIdCard(dto.studentId);
  }

  // ── Full export ───────────────────────────────────────────────────────────

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
