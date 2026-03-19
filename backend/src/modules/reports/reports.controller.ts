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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { GenerateReportCardDto, GenerateClassReportCardsDto, GenerateYearReportDto, GenerateDocumentDto, GenerateIdCardDto, BulkIdCardsDto } from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  // ── Report Cards ────────────────────────────────────────────────────────

  @Get('term/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get term report card data' })
  getTermReport(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
  ) {
    return this.service.getTermReportData(studentId, termId);
  }

  @Get('term/:studentId/html')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get term report card as HTML' })
  getTermReportHtml(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
  ) {
    return this.service.generateTermReportHtml(studentId, termId);
  }

  @Get('term/:studentId/pdf')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Download term report card as PDF' })
  async getTermReportPdf(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('termId') termId: string,
    @Res() res: express.Response,
  ) {
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
    return this.service.generateClassReportCards(dto.classSectionId, dto.termId);
  }

  @Get('year/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get year report data' })
  getYearReport(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return this.service.getYearReportData(studentId, academicYearId);
  }

  // ── Documents ───────────────────────────────────────────────────────────

  @Post('document')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate a document (transfer letter, transcript, etc.)' })
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
}
