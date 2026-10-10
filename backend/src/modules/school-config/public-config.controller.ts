import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SchoolConfigService } from './school-config.service';
import { PublicSchoolService } from '../../prisma/public-school.service';
import { withSchool } from '../../prisma/request-context';

// Deliberately unguarded: the login page and app shell need the school's name,
// colour and logo before a user authenticates. Returns only branding keys.
@ApiTags('School Config')
@Controller('school-config/public')
export class PublicConfigController {
  constructor(
    private readonly service: SchoolConfigService,
    private readonly publicSchool: PublicSchoolService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Public branding (school name, colour, logo)' })
  async getBranding(@Req() req: Request) {
    const schoolId = await this.publicSchool.resolve(req);
    return withSchool(schoolId, () => this.service.getPublicBranding());
  }
}
