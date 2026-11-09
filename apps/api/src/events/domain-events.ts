import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import type { TaskStatus } from '../generated/prisma/client';

// Things that happened in the domain, named in the past tense. A service says "this happened" and
// does not know or care who reacts (notifications today, live updates and e-mail queues later), so
// adding a reaction never means editing the service that caused the event.
export type TaskChangeKind =
  'created' | 'updated' | 'moved' | 'deleted' | 'comment' | 'dependency' | 'attachment';

export interface DomainEventMap {
  'task.created': {
    organizationId: string;
    actorId: string;
    taskId: string;
    projectId: string;
  };
  'task.status_changed': {
    organizationId: string;
    actorId: string;
    taskId: string;
    projectId: string;
    from: TaskStatus;
    to: TaskStatus;
  };
  // Anything that changes what a project's board, list or task dialog shows. Carries no content:
  // listeners (live updates) only say "look again", and the data itself is fetched through the
  // normal, permission-checked API.
  'task.changed': {
    organizationId: string;
    // null when the system acted (a recurring task being generated)
    actorId: string | null;
    taskId: string;
    projectId: string;
    kind: TaskChangeKind;
  };
  // A project was renamed, moved to another department or deleted (with its tasks).
  'project.changed': {
    organizationId: string;
    projectId: string;
  };
  // Someone joined or left the organization, or their role changed.
  'membership.changed': {
    organizationId: string;
    userId: string;
  };
  // Someone other than the new assignee set the assignee.
  'task.assigned': {
    organizationId: string;
    actorId: string;
    taskId: string;
    assigneeId: string;
  };
  // `mentionedUserIds` are the members newly mentioned by this save (never the author).
  'comment.created': {
    organizationId: string;
    actorId: string;
    taskId: string;
    commentId: string;
    mentionedUserIds: string[];
  };
  'comment.updated': {
    organizationId: string;
    actorId: string;
    taskId: string;
    commentId: string;
    mentionedUserIds: string[];
  };
}

export type DomainEventName = keyof DomainEventMap;

@Injectable()
export class DomainEvents {
  private readonly logger = new Logger(DomainEvents.name);

  constructor(private readonly emitter: EventEmitter2) {}

  // Called after the database change has been committed. Listeners run before this resolves (so
  // the caller and the tests can rely on their effects), but a failing listener must never undo or
  // fail a change that already happened: errors are logged and swallowed here.
  async publish<K extends DomainEventName>(name: K, payload: DomainEventMap[K]): Promise<void> {
    try {
      await this.emitter.emitAsync(name, payload);
    } catch (error) {
      this.logger.error(
        `A listener of "${name}" failed`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [DomainEvents],
  exports: [DomainEvents],
})
export class EventsModule {}
