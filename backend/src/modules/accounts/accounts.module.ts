import { forwardRef, Module } from '@nestjs/common';

import { JobsModule } from '../../jobs/jobs.module';
import { AccountsService } from './accounts.service';

/** Logins shared by a person's schools. See AccountsService. */
@Module({
  imports: [forwardRef(() => JobsModule)],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
