import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto';
import { PlatformOwnerGuard } from '../../common/guards';

/**
 * Platform routes: the schools themselves, not anything inside one.
 * Only the owner of Markova passes the guard, whatever school record they
 * happen to be signed into.
 */
@ApiTags('Schools')
@Controller('schools')
@UseGuards(AuthGuard('jwt'), PlatformOwnerGuard)
@ApiBearerAuth()
export class SchoolsController {
  constructor(private readonly service: SchoolsService) {}

  @Get()
  @ApiOperation({ summary: 'Every school on the platform' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Take a school on, with its first principal' })
  create(@Body() dto: CreateSchoolDto) {
    return this.service.create(dto);
  }
}
