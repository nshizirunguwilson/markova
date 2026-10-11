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
  UseInterceptors,
  UploadedFile,
  Res,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  QueryUserDto,
  ResetLoginDto,
} from './dto';
import { Roles, ANY_ROLE } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards';
import {
  fileFilterFor,
  filenameFor,
  retireStoredFile,
  validateUploadedImage,
} from '../../common/file-validation';

const PHOTO_REFUSAL = 'Only image files are allowed';

const photoStorage = diskStorage({
  destination: './uploads/photos',
  // Extension comes from the accepted mime type, never from the uploaded
  // filename. See storedFilename for what that prevented.
  filename: filenameFor('image', uuidv4, PHOTO_REFUSAL),
});

const SIGNATURE_REFUSAL = 'Only image files are allowed';

/* Kept apart from the photographs. A signature is the one image on the
   system that is worth forging, and a directory of its own is what lets it
   be backed up, audited and swept separately from six hundred portraits. */
const signatureStorage = diskStorage({
  destination: './uploads/signatures',
  filename: filenameFor('image', uuidv4, SIGNATURE_REFUSAL),
});

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * The directory. Administrators see all of it; the welfare staff see
   * students and nothing else.
   *
   * A nurse recording a clinic visit has to find the student first, and the
   * only way to do that was this route - which refused her, so the "New
   * visit" form had a student box that could never be filled. Opening the
   * whole directory to her instead would hand over every teacher's and
   * parent's email and phone number, which is not hers to read.
   *
   * So the filter is imposed here rather than trusted from the query: a
   * patron asking for `role=TEACHER` gets students, because the role is
   * overwritten before the service sees it.
   */
  @Get()
  @Roles('ADMIN', 'HEAD_TEACHER', 'PATRON', 'MATRON', 'NURSE')
  @ApiOperation({ summary: 'List all users with filters and pagination' })
  async findAll(
    @Query() query: QueryUserDto,
    @CurrentUser() current: { role: string },
  ) {
    if (current.role === 'ADMIN') return this.usersService.findAll(query);
    /*
      The head teacher manages the teaching staff, so the directory they see
      is the staffroom - not the whole roll, and not the students the welfare
      staff are narrowed to. Imposed here rather than trusted from the query,
      the same way the welfare staff's narrowing is.
    */
    if (current.role === 'HEAD_TEACHER') {
      /*
        Their directory is the staffroom, but the roll is theirs to read too:
        they run the academic side, and the student pickers on their own
        pages - generating a document, looking a child up - go through this
        route. Forcing TEACHER on every request meant those boxes could never
        be filled, and the page said "no student matches" for a name the
        school plainly has.

        So the narrowing keeps its point, which is that the whole directory
        (every parent's phone number) is not theirs, while the two lists that
        are stay reachable. Asked for anything else, they still get staff.
      */
      const asked = query.role === Role.STUDENT ? Role.STUDENT : Role.TEACHER;
      return this.usersService.findAll({ ...query, role: asked });
    }
    return this.usersService.findAll({ ...query, role: Role.STUDENT });
  }

  @Get(':id')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Get user by ID (own record for non-admins)' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: { id: string; role: string },
  ) {
    // Non-admins may only fetch their own record (e.g. a parent loading their
    // linked children). Admins may fetch anyone.
    if (current.role !== 'ADMIN' && current.id !== id) {
      throw new ForbiddenException('You can only access your own profile');
    }
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Post(':id/reset-login')
  @Roles('ADMIN')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary:
      'Reset how somebody signs in, when this school is the only one they belong to',
  })
  async resetLogin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetLoginDto,
  ) {
    return this.usersService.resetLogin(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft delete (deactivate) user' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(id);
  }

  @Post(':id/photo')
  @Roles(...ANY_ROLE)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: photoStorage,
      fileFilter: fileFilterFor('image', PHOTO_REFUSAL),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload profile photo' })
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() current: { id: string; role: string },
  ) {
    // Non-admins may only change their own photo.
    if (current.role !== 'ADMIN' && current.id !== id) {
      throw new ForbiddenException('You can only update your own photo');
    }
    if (!file) {
      throw new Error('Photo file is required');
    }
    validateUploadedImage(join(process.cwd(), 'uploads/photos', file.filename));
    // The photo being replaced is moved aside rather than deleted: somebody
    // uploading over the wrong person's record should not destroy the only
    // copy of their photograph. A missing old file must never stop the new
    // one being saved either.
    const user = await this.usersService.findOne(id);
    retireStoredFile(
      user.photoUrl,
      { existsSync, mkdirSync, renameSync },
      (p) => join(process.cwd(), p),
    );
    const photoUrl = `/uploads/photos/${file.filename}`;
    return this.usersService.updatePhoto(id, photoUrl);
  }

  /**
   * Taking a photograph down.
   *
   * The same rule the upload above carries: your own always, anybody's if
   * you are the office. A record with no photograph is a real state - the
   * avatar falls back to initials everywhere it is drawn - so this is a
   * change somebody may legitimately want rather than only a way to undo a
   * mistake.
   */
  @Delete(':id/photo')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Remove a profile photo' })
  async removePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: { id: string; role: string },
  ) {
    if (current.role !== 'ADMIN' && current.id !== id) {
      throw new ForbiddenException('You can only update your own photo');
    }
    /* Moved aside rather than deleted, exactly as replacing one is: somebody
       clearing the wrong person's record should not destroy the only copy of
       their photograph. */
    const user = await this.usersService.findOne(id);
    retireStoredFile(
      user.photoUrl,
      { existsSync, mkdirSync, renameSync },
      (p) => join(process.cwd(), p),
    );
    return this.usersService.updatePhoto(id, null);
  }

  /**
   * Somebody's own signature, uploaded from their own profile.
   *
   * Never on another person's behalf, and an administrator gets no exception
   * here where they have one for photographs. A signature uploaded by
   * somebody else is not a signature; it is the school's name written in
   * another person's hand, and a report card is signed on the strength of
   * exactly that distinction.
   */
  @Post(':id/signature')
  @Roles(...ANY_ROLE)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('signature', {
      storage: signatureStorage,
      fileFilter: fileFilterFor('image', SIGNATURE_REFUSAL),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload your own signature' })
  async uploadSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() current: { id: string; role: string },
  ) {
    if (current.id !== id) {
      throw new ForbiddenException(
        'A signature can only be uploaded by the person it belongs to.',
      );
    }
    if (!file) {
      throw new Error('Signature file is required');
    }
    validateUploadedImage(
      join(process.cwd(), 'uploads/signatures', file.filename),
    );
    const user = await this.usersService.findOne(id);
    retireStoredFile(
      user.signatureUrl,
      { existsSync, mkdirSync, renameSync },
      (p) => join(process.cwd(), p),
    );
    return this.usersService.updateSignature(
      id,
      `/uploads/signatures/${file.filename}`,
    );
  }

  /** Taking one down, which only its owner may do either. */
  @Delete(':id/signature')
  @Roles(...ANY_ROLE)
  @ApiOperation({ summary: 'Remove your own signature' })
  async removeSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: { id: string; role: string },
  ) {
    if (current.id !== id) {
      throw new ForbiddenException(
        'A signature can only be removed by the person it belongs to.',
      );
    }
    const user = await this.usersService.findOne(id);
    retireStoredFile(
      user.signatureUrl,
      { existsSync, mkdirSync, renameSync },
      (p) => join(process.cwd(), p),
    );
    return this.usersService.updateSignature(id, null);
  }

  @Post('bulk-import')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk import users from parsed CSV data' })
  async bulkImport(@Body() body: { role: Role; rows: any[] }) {
    const rows = body.rows.map((row) => ({ ...row, role: body.role }));
    return this.usersService.bulkImport(rows);
  }

  @Get('import-template/:role')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Download CSV template for bulk import' })
  getTemplate(@Param('role') role: Role, @Res() res: Response) {
    const template = this.usersService.getImportTemplate(role);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${role.toLowerCase()}_import_template.csv`,
    );
    res.send(template);
  }
}
