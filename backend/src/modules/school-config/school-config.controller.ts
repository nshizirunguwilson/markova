import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
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
import { existsSync, unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { SchoolConfigService } from './school-config.service';
import {
  UpsertConfigDto,
  BulkUpsertConfigDto,
  UpdateOnboardingDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import {
  fileFilterFor,
  filenameFor,
  removeStoredFile,
  validateUploadedImage,
} from '../../common/file-validation';

const BRANDING_REFUSAL = 'Only image files are allowed';

const brandingStorage = diskStorage({
  destination: './uploads/branding',
  // The extension comes from the accepted mime type, never from the name the
  // file arrived with.
  filename: filenameFor('image', uuidv4, BRANDING_REFUSAL),
});

@ApiTags('School Config')
@Controller('school-config')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class SchoolConfigController {
  constructor(private readonly configService: SchoolConfigService) {}

  /** Removes the file a branding key no longer points at. */
  private deleteOldFile(fileUrl: string | null | undefined) {
    removeStoredFile(fileUrl, { existsSync, unlinkSync }, (p) =>
      join(process.cwd(), p),
    );
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all school configs as list and map' })
  async findAll() {
    return this.configService.findAll();
  }

  @Get('onboarding')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get onboarding status' })
  async getOnboarding() {
    return this.configService.getOnboardingStatus();
  }

  @Get(':key')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get single config by key' })
  async findByKey(@Param('key') key: string) {
    return this.configService.findByKey(key);
  }

  @Put()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Upsert a single config' })
  async upsert(@Body() dto: UpsertConfigDto) {
    return this.configService.upsert(dto);
  }

  @Post('bulk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk upsert configs' })
  async bulkUpsert(@Body() dto: BulkUpsertConfigDto) {
    return this.configService.bulkUpsert(dto);
  }

  @Put('onboarding')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update onboarding progress' })
  async updateOnboarding(@Body() dto: UpdateOnboardingDto) {
    return this.configService.updateOnboarding(dto);
  }

  @Delete(':key')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a config by key' })
  async delete(@Param('key') key: string) {
    return this.configService.delete(key);
  }

  @Post('upload/logo')
  @Roles('ADMIN')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: brandingStorage,
      fileFilter: fileFilterFor('image', BRANDING_REFUSAL),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload school logo' })
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    validateUploadedImage(
      join(process.cwd(), 'uploads/branding', file.filename),
    );
    const oldConfig = await this.configService
      .findByKey('logo_url')
      .catch(() => null);
    this.deleteOldFile(oldConfig?.value);
    const url = `/uploads/branding/${file.filename}`;
    return this.configService.updateBrandingFile('logo_url', url);
  }

  @Post('upload/stamp')
  @Roles('ADMIN')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: brandingStorage,
      fileFilter: fileFilterFor('image', BRANDING_REFUSAL),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload school stamp' })
  async uploadStamp(@UploadedFile() file: Express.Multer.File) {
    validateUploadedImage(
      join(process.cwd(), 'uploads/branding', file.filename),
    );
    const oldConfig = await this.configService
      .findByKey('stamp_url')
      .catch(() => null);
    this.deleteOldFile(oldConfig?.value);
    const url = `/uploads/branding/${file.filename}`;
    return this.configService.updateBrandingFile('stamp_url', url);
  }

  @Post('upload/signature')
  @Roles('ADMIN')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: brandingStorage,
      fileFilter: fileFilterFor('image', BRANDING_REFUSAL),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload headmaster signature' })
  async uploadSignature(@UploadedFile() file: Express.Multer.File) {
    validateUploadedImage(
      join(process.cwd(), 'uploads/branding', file.filename),
    );
    const oldConfig = await this.configService
      .findByKey('signature_url')
      .catch(() => null);
    this.deleteOldFile(oldConfig?.value);
    const url = `/uploads/branding/${file.filename}`;
    return this.configService.updateBrandingFile('signature_url', url);
  }
}
