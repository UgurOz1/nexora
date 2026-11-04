import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient, type SocketLike } from './client';

// A socket that does nothing by itself: the test plays the server's part.
class FakeSocket implements SocketLike {
  connected = false;
  emitted: { event: string; args: unknown[] }[] = [];
  connects = 0;
  disconnects = 0;
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  private any: ((event: string, ...args: unknown[]) => void)[] = [];

  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }
  onAny(handler: (event: string, ...args: unknown[]) => void) {
    this.any.push(handler);
  }
  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args });
  }
  connect() {
    this.connects++;
  }
  disconnect() {
    this.disconnects++;
    this.connected = false;
  }

  // The server's side:
  serverConnects() {
    this.connected = true;
    this.handlers.get('connect')?.forEach((h) => h());
  }
  serverDisconnects(reason: string) {
    this.connected = false;
    this.handlers.get('disconnect')?.forEach((h) => h(reason));
  }
  serverRefuses(message: string) {
    this.handlers.get('connect_error')?.forEach((h) => h(new Error(message)));
  }
  serverSends(event: string, payload: unknown) {
    this.any.forEach((h) => h(event, payload));
  }
}

const org = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';

describe('RealtimeClient', () => {
  let socket: FakeSocket;
  let refresh: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  let clock: number;
  let client: RealtimeClient;

  beforeEach(() => {
    socket = new FakeSocket();
    refresh = vi.fn<() => Promise<string | null>>().mockResolvedValue('fresh-token');
    clock = 100_000;
    client = new RealtimeClient(
      () => socket,
      refresh,
      () => clock,
    );
    client.start();
  });

  const subscribes = () =>
    socket.emitted.filter((e) => e.event === 'subscribe').map((e) => e.args[0]);

  it('joins its rooms as soon as the connection is up, and again after every reconnect', () => {
    client.subscribe({ organizationId: org, projectId: project });
    expect(subscribes()).toEqual([]); // not connected yet

    socket.serverConnects();
    expect(subscribes()).toEqual([{ organizationId: org, projectId: project }]);

    socket.serverDisconnects('transport close');
    socket.serverConnects();
    expect(subscribes()).toHaveLength(2); // the server forgot the rooms; it is told again
  });

  it('joins at once when it is already connected', () => {
    socket.serverConnects();

    client.subscribe({ organizationId: org });

    expect(subscribes()).toEqual([{ organizationId: org }]);
  });

  it('leaves a project room when nobody wants it any more, not before', () => {
    socket.serverConnects();
    const first = client.subscribe({ organizationId: org, projectId: project });
    const second = client.subscribe({ organizationId: org, projectId: project });
    expect(subscribes()).toHaveLength(1); // asked once for two users of the same room

    first();
    first(); // calling twice changes nothing
    expect(socket.emitted.some((e) => e.event === 'unsubscribe')).toBe(false);
    second();

    expect(socket.emitted.filter((e) => e.event === 'unsubscribe')).toEqual([
      { event: 'unsubscribe', args: [{ projectId: project }] },
    ]);
  });

  it('passes server events to whoever listens, until they stop', () => {
    const seen: unknown[] = [];
    const off = client.on('tasks.changed', (payload) => seen.push(payload));

    socket.serverSends('tasks.changed', { taskId: 't1' });
    socket.serverSends('something.else', {});
    off();
    socket.serverSends('tasks.changed', { taskId: 't2' });

    expect(seen).toEqual([{ taskId: 't1' }]);
  });

  it('gets a fresh token and reconnects when the server closed the socket for an expired token', async () => {
    socket.serverConnects();
    socket.serverDisconnects('io server disconnect');
    await vi.waitFor(() => expect(socket.connects).toBe(1));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does the same when the handshake is refused as unauthorized', async () => {
    socket.serverRefuses('unauthorized');
    await vi.waitFor(() => expect(socket.connects).toBe(1));
  });

  it('leaves other errors and ordinary disconnects to the library', async () => {
    socket.serverRefuses('xhr poll error');
    socket.serverDisconnects('transport close');
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
    expect(socket.connects).toBe(0);
  });

  it('does not hammer the token endpoint', async () => {
    socket.serverRefuses('unauthorized');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    socket.serverRefuses('unauthorized'); // again, straight away
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    clock += 6000;
    socket.serverRefuses('unauthorized');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('closes down when the session is over', async () => {
    refresh.mockResolvedValue(null);

    socket.serverDisconnects('io server disconnect');
    await vi.waitFor(() => expect(socket.disconnects).toBe(1));

    expect(socket.connects).toBe(0);
  });
});
