import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService, room } from './realtime.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A browser tab follows one organization and one project at a time; this only stops a client
// from joining an unbounded number of rooms.
const MAX_ROOMS_PER_SOCKET = 20;

interface SocketData {
  userId: string;
  // When the access token expires, in ms since the epoch.
  expiresAt: number;
}

export type SubscribeResult = { ok: true } | { ok: false; error: string };

// The WebSocket door of the API. Same rules as the HTTP API, in two places:
//  1. Who you are is decided ONCE, when the connection is made, from the access token (a
//     middleware that runs before the connection exists; a bad token never becomes a socket).
//  2. What you may listen to is decided when you ask to join a room, by looking at the database.
//     Being connected gives you nothing: you start in your own private user room only.
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('unauthorized')),
      );
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const auth = socket.handshake.auth as { token?: unknown };
    if (typeof auth.token !== 'string' || !auth.token) {
      throw new Error('missing token');
    }
    const payload = await this.jwt.verifyAsync<AccessTokenPayload & { exp: number }>(auth.token);
    const data: SocketData = { userId: payload.sub, expiresAt: payload.exp * 1000 };
    socket.data = data;
  }

  handleConnection(client: Socket) {
    const { userId, expiresAt } = client.data as SocketData;
    void client.join(room.user(userId));

    // An access token lives 15 minutes, and a socket that stayed open forever would outlive it.
    // When it expires the server closes the socket; the browser fetches a fresh token and
    // reconnects, so a revoked session is shut out within one token lifetime.
    const timer = setTimeout(
      () => {
        client.emit('token_expired');
        client.disconnect(true);
      },
      Math.max(0, expiresAt - Date.now()),
    );
    timer.unref();
    client.once('disconnect', () => clearTimeout(timer));
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeResult> {
    const { userId } = client.data as SocketData;
    const { organizationId, projectId } = (body ?? {}) as Record<string, unknown>;
    if (typeof organizationId !== 'string' || !UUID.test(organizationId)) {
      return { ok: false, error: 'organizationId is required' };
    }
    if (projectId !== undefined && (typeof projectId !== 'string' || !UUID.test(projectId))) {
      return { ok: false, error: 'projectId is not valid' };
    }
    if (client.rooms.size >= MAX_ROOMS_PER_SOCKET) {
      return { ok: false, error: 'Too many subscriptions' };
    }

    // The same answer for "no such organization" and "not your organization", like the HTTP API.
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    if (!membership) {
      return { ok: false, error: 'Not found' };
    }
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        return { ok: false, error: 'Not found' };
      }
      await client.join(room.project(projectId));
    }
    await client.join(room.org(organizationId));
    this.logger.debug({ userId, organizationId, projectId }, 'Socket subscribed');
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeResult> {
    const { projectId } = (body ?? {}) as Record<string, unknown>;
    if (typeof projectId === 'string' && UUID.test(projectId)) {
      await client.leave(room.project(projectId));
    }
    return { ok: true };
  }
}
