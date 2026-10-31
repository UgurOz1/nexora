import { Module } from '@nestjs/common';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksService } from './recurring-tasks.service';

@Module({
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService],
  // Exported so the scheduled job (week 10) can call generateDue().
  exports: [RecurringTasksService],
})
export class RecurringTasksModule {}
