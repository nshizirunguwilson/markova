import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SchoolConfigService } from './school-config.service';

// Deliberately unguarded: the login page and app shell need the school's name,
// colour and logo before a user authenticates. Returns only branding keys.
@ApiTags('School Config')
@Controller('school-config/public')
export class PublicConfigController {
  constructor(private readonly service: SchoolConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Public branding (school name, colour, logo)' })
  getBranding() {
    return this.service.getPublicBranding();
  }
}
