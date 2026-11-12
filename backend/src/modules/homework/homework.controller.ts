import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import * as fsModule from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { schoolStorage, uploadUrl } from '../../common/uploads';
import {
  fileFilterFor,
  filenameFor,
  removeStoredFile,
  validateUploadedAttachment,
} from '../../common/file-validation';
import {
  MAX_ANY_ATTACHMENT_BYTES,
  maxBytesFor,
  tooLargeMessage,
} from '../../common/attachment-limits';
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

const SHEET_REFUSAL = 'That kind of file cannot be set as homework';

@ApiTags('Homework')
@Controller('homework')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class HomeworkController {
  constructor(
    private readonly service: HomeworkService,
    private readonly ownership: OwnershipService,
  ) {}

  /**
   * The sheet a piece of work is set on: a past paper, a worksheet, a
   * reading. Uploaded first, then named in the create or update. The same
   * files, caps and checks as a chat attachment; the file lands in the
   * school's attachments folder either way.
   */
  @Post('upload')
  @Roles('ADMIN', 'TEACHER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: schoolStorage(
        'attachments',
        filenameFor('attachment', uuidv4, SHEET_REFUSAL),
      ),
      fileFilter: fileFilterFor('attachment', SHEET_REFUSAL),
      limits: { fileSize: MAX_ANY_ATTACHMENT_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload the sheet a piece of work is set on' })
  uploadSheet(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('schoolId') schoolId: string,
  ) {
    if (!file) throw new BadRequestException('No file was sent');
    if (file.size > maxBytesFor(file.mimetype)) {
      removeStoredFile(file.path, fsModule, (p) => p);
      throw new BadRequestException(tooLargeMessage(file.mimetype, file.size));
    }
    // It has to be what it said it was: /uploads serves by extension.
    validateUploadedAttachment(file.path, file.mimetype);
    return {
      fileUrl: uploadUrl(schoolId, 'attachments', file.filename),
      fileName: file.originalname,
      size: file.size,
    };
  }

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
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyTeacherHomeworkAccess(user.id, user.role, id);
    return this.service.findById(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update homework' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHomeworkDto,
    @CurrentUser() user: any,
  ) {
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
  grade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GradeSubmissionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.grade(id, dto, user.id);
  }

  // ── Student View ────────────────────────────────────────────────────────

  @Get('student/:studentId')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @ApiOperation({ summary: 'Get homework for a student' })
  async getStudentHomework(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: any,
  ) {
    await this.ownership.verifyStudentAccess(
      user.id,
      user.role,
      studentId,
      'results',
    );
    // The class comes from the student, never from the request. A
    // classSectionId the screens still send is ignored.
    return this.service.getStudentHomework(studentId);
  }
}
