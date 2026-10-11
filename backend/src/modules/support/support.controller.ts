import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards';
import { SupportService } from './support.service';
import { SupportPlanDto } from './support.dto';

/**
 * Support plans for students with special educational needs (B7). The
 * Director of Studies and the nurse keep them; who sees how much is decided
 * in SupportService.
 */
@ApiTags('Support')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SupportController {
  constructor(private support: SupportService) {}

  @Get('students/:id/support-plan')
  @Roles('HEAD_TEACHER', 'NURSE', 'ADMIN', 'TEACHER', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: "A student's support plan, as much as you may see" })
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    // A parent is held to the 'health' kind inside forStudent.
    return this.support.forStudent(id, user);
  }

  @Put('students/:id/support-plan')
  @Roles('HEAD_TEACHER', 'NURSE')
  @ApiOperation({ summary: "Make or change a student's support plan" })
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupportPlanDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.support.save(id, dto, user.id);
  }

  @Delete('students/:id/support-plan')
  @Roles('HEAD_TEACHER', 'NURSE')
  @ApiOperation({ summary: "Remove a student's support plan" })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.remove(id);
  }

  @Get('support/class/:classSectionId')
  @Roles('HEAD_TEACHER', 'NURSE', 'ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'The students of a class with exam arrangements' })
  forClass(
    @Param('classSectionId', ParseUUIDPipe) classSectionId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.support.forClass(classSectionId, user);
  }

  @Get('support/exams/:examId/sheet')
  @Roles('HEAD_TEACHER', 'NURSE', 'ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'The arrangements sheet for one exam' })
  examSheet(
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.support.examSheet(examId, user);
  }

  @Get('support/register')
  @Roles('HEAD_TEACHER', 'NURSE', 'ADMIN')
  @ApiOperation({ summary: 'Every support plan in the school' })
  register() {
    return this.support.register();
  }
}
