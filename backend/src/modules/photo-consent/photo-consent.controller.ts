import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards';
import { PhotoConsentService } from './photo-consent.service';
import { PhotoConsentDto } from './photo-consent.dto';

/**
 * What a family agreed to for a student's photo (B6). Parents answer for a
 * child under 18, the student from 18, and the office copies in paper forms.
 */
@ApiTags('Photo consent')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PhotoConsentController {
  constructor(private consent: PhotoConsentService) {}

  @Get('students/:id/photo-consent')
  @Roles('ADMIN', 'PARENT', 'STUDENT')
  @ApiOperation({ summary: "What the family agreed to for a student's photo" })
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.consent.forStudent(id, user);
  }

  @Put('students/:id/photo-consent')
  @Roles('ADMIN', 'PARENT', 'STUDENT')
  @ApiOperation({
    summary: "Answer the three questions about a student's photo",
  })
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhotoConsentDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.consent.answer(id, dto, user);
  }

  @Get('photo-consent/register')
  @Roles('ADMIN')
  @ApiOperation({ summary: "Every student's photo answers, for the office" })
  register() {
    return this.consent.register();
  }
}
