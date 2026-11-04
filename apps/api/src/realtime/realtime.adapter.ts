import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

// Browsers may open a WebSocket from the web app's origin only. In development the same app is
// often opened as 127.0.0.1 instead of localhost, so that spelling is allowed outside production.
export function realtimeOrigins(appUrl: string, nodeEnv: string): string[] {
  const origin = new URL(appUrl).origin;
  if (nodeEnv === 'production') return [origin];
  const other = new URL(appUrl);
  other.hostname = other.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  return [...new Set([origin, other.origin])];
}

// Socket.IO on its own only knows the sockets connected to ITS server. With three API servers, a
// message emitted on server A would never reach a browser connected to server B. The Redis
// adapter publishes every emit through Redis pub/sub, so each server forwards it to its own
// sockets: a room works across the whole fleet.
export class RedisIoAdapter extends IoAdapter {
  private readonly clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins },
    }) as Server;
    const pub = new Redis(this.redisUrl);
    const sub = pub.duplicate();
    this.clients.push(pub, sub);
    server.adapter(createAdapter(pub, sub));
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    this.clients.forEach((client) => client.disconnect());
  }
}
