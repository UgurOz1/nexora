import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEventMap } from '../events/domain-events';
import { RealtimeService } from './realtime.service';

// Another reaction to domain events, next to notifications: tell the browsers that watch the
// project that something changed. TasksService never heard of WebSockets.
@Injectable()
export class RealtimeListener {
  constructor(private readonly realtime: RealtimeService) {}

  @OnEvent('task.changed')
  onTaskChanged(event: DomainEventMap['task.changed']) {
    this.realtime.toProject(event.projectId, 'tasks.changed', {
      taskId: event.taskId,
      actorId: event.actorId,
      kind: event.kind,
    });
  }
}
