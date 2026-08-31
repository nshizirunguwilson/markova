import { forwardRef, Module } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsModule } from '../../jobs/jobs.module';

@Module({
  imports: [forwardRef(() => JobsModule), PrismaModule, NotificationsModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
