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
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LibraryService } from './library.service';
import {
  CreateBookDto,
  UpdateBookDto,
  BulkImportBooksDto,
  CheckoutDto,
  ReturnDto,
  ReportLostDto,
  QueryBooksDto,
} from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Library')
@Controller('library')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  // ── Book CRUD ───────────────────────────────────────────────────────────

  @Post('books')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Add a new book' })
  createBook(@Body() dto: CreateBookDto) {
    return this.service.createBook(dto);
  }

  @Post('books/bulk')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Bulk import books' })
  bulkImport(@Body() dto: BulkImportBooksDto) {
    return this.service.bulkImport(dto);
  }

  @Get('books')
  @Roles('ADMIN', 'LIBRARIAN', 'STUDENT', 'TEACHER')
  @ApiOperation({ summary: 'Search and list books' })
  findAll(@Query() query: QueryBooksDto) {
    return this.service.findAll(query);
  }

  @Get('books/:id')
  @Roles('ADMIN', 'LIBRARIAN', 'STUDENT', 'TEACHER')
  @ApiOperation({ summary: 'Get book details' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Put('books/:id')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Update a book' })
  updateBook(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookDto) {
    return this.service.updateBook(id, dto);
  }

  @Delete('books/:id')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Delete a book' })
  deleteBook(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteBook(id);
  }

  // ── Checkout / Return ───────────────────────────────────────────────────

  @Post('checkout')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Check out a book to a student' })
  checkout(@Body() dto: CheckoutDto) {
    return this.service.checkout(dto);
  }

  @Post('return')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Return a book' })
  returnBook(@Body() dto: ReturnDto) {
    return this.service.returnBook(dto);
  }

  @Post('lost')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Report a book as lost' })
  reportLost(@Body() dto: ReportLostDto) {
    return this.service.reportLost(dto.loanId);
  }

  // ── Loans ───────────────────────────────────────────────────────────────

  @Get('loans/active')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Get all active loans' })
  getActiveLoans() {
    return this.service.getActiveLoans();
  }

  @Get('loans/overdue')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Get overdue loans' })
  getOverdueLoans() {
    return this.service.getOverdueLoans();
  }

  @Get('loans/reminders')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Get loans due in 2 days' })
  getDueReminders() {
    return this.service.getDueReminders();
  }

  @Post('reminders/send')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Send due-date reminder emails to borrowers' })
  sendDueReminders() {
    return this.service.sendDueReminders();
  }

  @Get('loans/my')
  @Roles('STUDENT', 'TEACHER')
  @ApiOperation({ summary: 'Get current user loans' })
  getMyLoans(@CurrentUser() user: any) {
    return this.service.getUserLoans(user.id);
  }

  // ── Analytics ───────────────────────────────────────────────────────────

  @Get('analytics')
  @Roles('ADMIN', 'LIBRARIAN')
  @ApiOperation({ summary: 'Get library analytics' })
  getAnalytics() {
    return this.service.getAnalytics();
  }
}
