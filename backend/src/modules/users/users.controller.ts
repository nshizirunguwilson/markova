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
import { extname, join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto';
import { Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards';
import { validateUploadedImage } from '../../common/file-validation';

const photoStorage = diskStorage({
  destination: './uploads/photos',
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all users with filters and pagination' })
  async findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
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

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft delete (deactivate) user' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(id);
  }

  @Post(':id/photo')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: photoStorage,
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
      },
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
    // Delete old photo file if it exists
    const user = await this.usersService.findOne(id);
    if (user.photoUrl) {
      try {
        const oldPath = join(process.cwd(), user.photoUrl);
        if (existsSync(oldPath)) {
          unlinkSync(oldPath);
        }
      } catch {
        // Ignore cleanup errors — the old file may already be gone
      }
    }
    const photoUrl = `/uploads/photos/${file.filename}`;
    return this.usersService.updatePhoto(id, photoUrl);
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
