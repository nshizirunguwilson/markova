import {
  Body,
  Controller,
  Delete,
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
import { ActivitiesService } from './activities.service';
import {
  ActivityAttendanceDto,
  ActivityQueryDto,
  AddClassDto,
  CancelActivityDto,
  ConsentDto,
  CreateActivityDto,
  ParticipantDto,
  UpdateActivityDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Clubs, matches, assemblies, visiting day and trips.
 *
 * Reading the calendar is open to everyone in the school, because an event
 * nobody can see is an event nobody attends. Writing belongs to the people who
 * organise: the office, the boarding staff, and teachers who run a club.
 */
@ApiTags('Activities')
@Controller('activities')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: 'The calendar, filterable by kind and date' })
  findAll(@Query() query: ActivityQueryDto) {
    return this.service.findAll(query);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'The next few, for a dashboard' })
  upcoming(@Query('limit') limit?: string) {
    return this.service.upcoming(limit ? Number(limit) : 5);
  }

  @Get('student/:studentId')
  @ApiOperation({ summary: 'Everything one student is concerned by' })
  forStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
    @Query('from') from?: string,
  ) {
    return this.service.forStudent(studentId, from, {
      userId: user.id,
      role: user.role,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One activity with its list of students' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Get(':id/consent')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({
    summary: 'Who has agreed, who has refused, and who has not answered',
  })
  consentSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.consentSummary(id);
  }

  @Post()
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Put something on the calendar' })
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Put(':id')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Change an activity' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({
    summary: 'Call it off, keeping it visible so families are told why',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelActivityDto,
  ) {
    return this.service.cancel(id, dto.reason);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete one nobody has signed up for yet' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/participants')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Put a student on the list' })
  addParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ParticipantDto,
  ) {
    return this.service.addParticipant(id, dto.studentId);
  }

  @Post(':id/participants/class')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Sign up a whole class at once' })
  addClass(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddClassDto) {
    return this.service.addClass(id, dto.classSectionId);
  }

  @Delete(':id/participants/:studentId')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Take a student off the list' })
  removeParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.service.removeParticipant(id, studentId);
  }

  // A parent answers for their own child; the office can record an answer
  // given on paper or over the phone.
  @Post(':id/consent')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'PARENT')
  @ApiOperation({ summary: 'Record whether a parent agreed' })
  consent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConsentDto,
    @CurrentUser() user: any,
  ) {
    return this.service.recordConsent(
      id,
      dto.studentId,
      dto.consent,
      dto.note,
      user.id,
      user.role,
    );
  }

  @Post(':id/attendance')
  @Roles('ADMIN', 'TEACHER', 'PATRON', 'MATRON')
  @ApiOperation({ summary: 'Take the register for an activity' })
  attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityAttendanceDto,
  ) {
    return this.service.markAttendance(id, dto.records);
  }
}
