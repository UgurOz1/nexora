import { Module } from '@nestjs/common';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTasksProcessor } from './recurring-tasks.processor';
import { RecurringTasksService } from './recurring-tasks.service';

@Module({
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService, RecurringTasksProcessor],
  exports: [RecurringTasksService],
})
export class RecurringTasksModule {}
