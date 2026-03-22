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
import { HomeworkService } from './homework.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  CreateHomeworkDto,
  UpdateHomeworkDto,
  SubmitHomeworkDto,
  GradeSubmissionDto,
  QueryHomeworkDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Homework')
@Controller('homework')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class HomeworkController {
  constructor(
    private readonly service: HomeworkService,
    private readonly ownership: OwnershipService,
  ) {}

  @Post()
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Create homework' })
  create(@Body() dto: CreateHomeworkDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.teacherId, user.role);
  }

  @Get()
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List homework' })
  findAll(@Query() query: QueryHomeworkDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get homework details with submissions' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    await this.ownership.verifyTeacherHomeworkAccess(user.id, user.role, id);
    return this.service.findById(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update homework' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHomeworkDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.teacherId, user.role);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Delete homework' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.delete(id, user.teacherId, user.role);
  }

  // ── Submissions ─────────────────────────────────────────────────────────

  @Post('submit')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Submit homework' })
  submit(@Body() dto: SubmitHomeworkDto, @CurrentUser() user: any) {
    return this.service.submit(dto, user.studentId);
  }

  @Put('submissions/:id/grade')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Grade a submission' })
  grade(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GradeSubmissionDto, @CurrentUser() user: any) {
    return this.service.grade(id, dto, user.id);
  }

  // ── Student View ────────────────────────────────────────────────────────

  @Get('student/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get homework for a student' })
  async getStudentHomework(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('classSectionId') classSectionId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(user.id, user.role, studentId);
    return this.service.getStudentHomework(studentId, classSectionId);
  }
}
