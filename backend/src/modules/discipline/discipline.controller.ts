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
import { DisciplineService } from './discipline.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  CreateAppealDto,
  ReviewAppealDto,
  AcknowledgeIncidentDto,
  QueryIncidentsDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Discipline')
@Controller('discipline')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class DisciplineController {
  constructor(
    private readonly service: DisciplineService,
    private readonly ownership: OwnershipService,
  ) {}

  // ── Incidents ───────────────────────────────────────────────────────────

  @Post('incidents')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Record a discipline incident' })
  createIncident(@Body() dto: CreateIncidentDto, @CurrentUser() user: any) {
    return this.service.createIncident(dto, user.id);
  }

  @Get('incidents')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List discipline incidents' })
  findIncidents(@Query() query: QueryIncidentsDto) {
    return this.service.findIncidents(query);
  }

  @Get('incidents/:id')
  @Roles('ADMIN', 'TEACHER', 'PARENT')
  @ApiOperation({ summary: 'Get incident details' })
  async getIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    if (user.role === 'PARENT') {
      const incident = await this.service.getIncidentById(id);
      await this.ownership.verifyStudentAccess(
        user.id,
        user.role,
        (incident as any).studentId,
      );
      return incident;
    }
    return this.service.getIncidentById(id);
  }

  @Put('incidents/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update an incident' })
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.service.updateIncident(id, dto);
  }

  @Delete('incidents/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete an incident and restore points' })
  deleteIncident(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteIncident(id);
  }

  // ── Student Discipline ──────────────────────────────────────────────────

  @Get('student/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get student discipline summary' })
  async getStudentDiscipline(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getStudentDiscipline(studentId);
  }

  // ── Appeals ─────────────────────────────────────────────────────────────

  @Post('appeals')
  @Roles('PARENT', 'STUDENT')
  @ApiOperation({ summary: 'Submit an appeal' })
  createAppeal(@Body() dto: CreateAppealDto, @CurrentUser() user: any) {
    return this.service.createAppeal(dto, user.id);
  }

  @Get('appeals/pending')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get pending appeals' })
  getPendingAppeals() {
    return this.service.getPendingAppeals();
  }

  @Put('appeals/:id/review')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Review an appeal (approve/reject)' })
  reviewAppeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAppealDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reviewAppeal(id, dto, user.id);
  }

  // ── Parent Acknowledgement ──────────────────────────────────────────────

  @Post('acknowledge')
  @Roles('PARENT')
  @ApiOperation({ summary: 'Parent acknowledges an incident' })
  acknowledge(@Body() dto: AcknowledgeIncidentDto, @CurrentUser() user: any) {
    return this.service.acknowledgeIncident(dto.incidentId, user.id);
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get discipline dashboard data' })
  getDashboard(@Query('termId') termId?: string) {
    return this.service.getDashboard(termId);
  }
}
