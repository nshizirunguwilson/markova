import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpenToFormerStudents, Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards';
import { SharingService } from './sharing.service';
import { SharingDto } from './sharing.dto';

/**
 * What a student of 18 or over lets their parents see. A student who has
 * left keeps this too: their records are still theirs.
 */
@ApiTags('Sharing')
@ApiBearerAuth()
@OpenToFormerStudents()
@Controller('students/me/sharing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SharingController {
  constructor(private sharing: SharingService) {}

  @Get()
  @Roles('STUDENT')
  @ApiOperation({ summary: 'What my parents can see of my records' })
  mine(@CurrentUser() user: { id: string }) {
    return this.sharing.mine(user.id);
  }

  @Put()
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Choose what my parents can see, from 18' })
  change(@CurrentUser() user: { id: string }, @Body() dto: SharingDto) {
    return this.sharing.change(user.id, dto);
  }
}
