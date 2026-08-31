import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto';

/**
 * Who changed what.
 *
 * ADMIN only, deliberately, and not the Director of Studies. This is the one
 * screen that shows what everybody in the school has done, including the
 * principal, and widening it turns an accountability record into a way of
 * watching colleagues.
 */
@ApiTags('Audit')
@Controller('audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'The record of who changed what' })
  find(@Query() query: QueryAuditDto) {
    return this.service.find(query);
  }

  @Get('filters')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'The kinds of record and action actually present' })
  filters() {
    return this.service.filters();
  }
}
