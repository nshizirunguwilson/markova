import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PauseKind } from '@prisma/client';
import { Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards';
import { JourneyService } from './journey.service';
import { BackDto, LeaveDto, PassedAwayDto, PauseDto, ReadmitDto } from './dto';

/**
 * A student's journey: suspended, away, back, leaving, coming back.
 *
 * Pausing a student is for the principal and the Director of Studies.
 * Taking a student off the roll, or back onto it, is the principal's alone.
 */
@ApiTags('Journey')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class JourneyController {
  constructor(private journey: JourneyService) {}

  @Get('students/:id/journey')
  @Roles('ADMIN', 'HEAD_TEACHER', 'TEACHER')
  @ApiOperation({ summary: 'Where a student stands, and how they got here' })
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.journey(id);
  }

  @Post('students/:id/journey/suspend')
  @Roles('ADMIN', 'HEAD_TEACHER')
  @ApiOperation({ summary: 'Suspend a student from one day to another' })
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PauseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.journey.pause(id, PauseKind.SUSPENDED, dto, user.id);
  }

  @Post('students/:id/journey/away')
  @Roles('ADMIN', 'HEAD_TEACHER')
  @ApiOperation({ summary: 'Record time away: illness, a new baby' })
  away(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PauseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.journey.pause(id, PauseKind.AWAY, dto, user.id);
  }

  @Post('students/:id/journey/back')
  @Roles('ADMIN', 'HEAD_TEACHER')
  @ApiOperation({ summary: 'A suspended or away student is back' })
  back(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BackDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.journey.back(id, dto, user.id);
  }

  @Post('students/:id/journey/leave')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'A student leaves: withdrawn, expelled, transferred, graduated',
  })
  leave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.journey.leave(id, dto, user.id);
  }

  @Post('students/:id/journey/passed-away')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Record that a student passed away' })
  passedAway(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PassedAwayDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.journey.passedAway(id, dto, user.id);
  }

  @Post('students/:id/journey/readmit')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bring a student who left back onto the roll' })
  readmit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReadmitDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.journey.readmit(id, dto, user.id);
  }

  @Post('users/:id/passed-away')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Record that a parent or guardian passed away' })
  parentPassedAway(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PassedAwayDto,
  ) {
    return this.journey.parentPassedAway(id, dto);
  }
}
