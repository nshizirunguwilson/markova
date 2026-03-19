import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HelpService } from './help.service';
import { CreateFaqDto, UpdateFaqDto, CreateTicketDto, UpdateTicketStatusDto } from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Help')
@Controller('help')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class HelpController {
  constructor(private readonly service: HelpService) {}

  // ── FAQ ─────────────────────────────────────────────────────────────────────

  @Get('faqs')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Search FAQ articles' })
  findFaqs(@Query('search') search?: string) {
    return this.service.findAllFaqs(search);
  }

  @Get('faqs/admin')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all FAQs (including unpublished)' })
  findFaqsAdmin() {
    return this.service.findAllFaqsAdmin();
  }

  @Post('faqs')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create FAQ article' })
  createFaq(@Body() dto: CreateFaqDto) {
    return this.service.createFaq(dto);
  }

  @Patch('faqs/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update FAQ article' })
  updateFaq(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) {
    return this.service.updateFaq(id, dto);
  }

  @Delete('faqs/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete FAQ article' })
  deleteFaq(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteFaq(id);
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  @Post('tickets')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'Submit support ticket' })
  createTicket(@Req() req: any, @Body() dto: CreateTicketDto) {
    return this.service.createTicket(req.user.id, dto);
  }

  @Get('tickets')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all support tickets' })
  findAllTickets(@Query('status') status?: string) {
    return this.service.findAllTickets(status);
  }

  @Get('tickets/mine')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN')
  @ApiOperation({ summary: 'List my support tickets' })
  findMyTickets(@Req() req: any) {
    return this.service.findMyTickets(req.user.id);
  }

  @Patch('tickets/:id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update ticket status' })
  updateTicketStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.service.updateTicketStatus(id, dto);
  }
}
