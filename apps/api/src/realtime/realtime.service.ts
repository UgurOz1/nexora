import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

// Rooms are named lists of connected sockets. Emitting to a room reaches every socket in it, on
// this server and (through the Redis adapter) on every other API server.
export const room = {
  user: (userId: string) => `user:${userId}`,
  org: (organizationId: string) => `org:${organizationId}`,
  project: (projectId: string) => `project:${projectId}`,
};

// What the rest of the app uses to push something to browsers. The gateway hands over the Socket.IO
// server once it has started; before that (and in code that runs without a gateway) emitting
// does nothing.
@Injectable()
export class RealtimeService {
  server: Server | undefined;

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(room.user(userId)).emit(event, payload);
  }

  toProject(projectId: string, event: string, payload: unknown): void {
    this.server?.to(room.project(projectId)).emit(event, payload);
  }
}
