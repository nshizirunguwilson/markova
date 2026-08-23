import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClinicService } from './clinic.service';
import {
  CreateVisitDto,
  GiveMedicineDto,
  HealthRecordDto,
  UpdateVisitDto,
  VisitQueryDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * The sick bay.
 *
 * Every route here is closed by default. Writing belongs to the nurse and the
 * boarding staff; reading one student's record additionally opens to that
 * student's own parent, which the service checks because a role alone cannot
 * tell whose child this is. Teachers appear nowhere: a class teacher has no
 * business knowing a student is on epilepsy medication.
 */
@ApiTags('Clinic')
@Controller('clinic')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ClinicController {
  constructor(private readonly service: ClinicService) {}

  @Get('summary')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'Visits, referrals and repeat visitors' })
  summary(@Query('days') days?: string) {
    return this.service.summary(days ? Number(days) : 30);
  }

  @Get('visits')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'The clinic book, filterable' })
  findVisits(@Query() query: VisitQueryDto) {
    return this.service.findVisits(query);
  }

  @Get('visits/:id')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'One visit with the doses given during it' })
  findVisit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findVisit(id);
  }

  @Post('visits')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'A student arrives at the sick bay' })
  createVisit(@Body() dto: CreateVisitDto, @CurrentUser() user: any) {
    return this.service.createVisit(dto, user.id);
  }

  @Put('visits/:id')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'Correct a visit, never delete it' })
  updateVisit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitDto,
  ) {
    return this.service.updateVisit(id, dto);
  }

  @Post('visits/:id/discharge')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'Send a student back from the sick bay' })
  discharge(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.discharge(id);
  }

  @Post('visits/:id/parent-notified')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'Record that the family has been told' })
  notified(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markParentNotified(id);
  }

  @Post('medication')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'Record a dose, refusing an unsafe repeat' })
  giveMedicine(@Body() dto: GiveMedicineDto, @CurrentUser() user: any) {
    return this.service.giveMedicine(dto, user.id);
  }

  // A parent asks about their own child; the service decides whose child it is.
  @Get('student/:studentId/medication')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON', 'PARENT')
  @ApiOperation({ summary: 'Every dose given to one student' })
  async medicationFor(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.service.assertMaySee(studentId, {
      userId: user.id,
      role: user.role,
    });
    return this.service.medicationFor(studentId);
  }

  @Get('student/:studentId/visits')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON', 'PARENT')
  @ApiOperation({ summary: 'The sick bay visits of one student' })
  async visitsFor(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.service.assertMaySee(studentId, {
      userId: user.id,
      role: user.role,
    });
    return this.service.findVisits({
      studentId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('student/:studentId')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON', 'PARENT')
  @ApiOperation({ summary: 'The emergency card, plus recent history' })
  async emergencyCard(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.service.assertMaySee(studentId, {
      userId: user.id,
      role: user.role,
    });
    return this.service.emergencyCard(studentId);
  }

  @Put('student/:studentId')
  @Roles('ADMIN', 'NURSE', 'MATRON', 'PATRON')
  @ApiOperation({ summary: 'Fill in or change the emergency card' })
  saveRecord(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: HealthRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.service.saveHealthRecord(studentId, dto, user.id);
  }
}
