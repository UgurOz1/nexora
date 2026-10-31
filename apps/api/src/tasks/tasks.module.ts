import { Module } from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { HistoryService } from './history.service';
import { TaskDetailsController } from './task-details.controller';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController, TaskDetailsController],
  providers: [TasksService, DependenciesService, HistoryService],
})
export class TasksModule {}
