// The part of a Socket.IO client this code uses. Naming it keeps RealtimeClient free of the
// library (and testable with a hand-made fake).
export interface SocketLike {
  connected: boolean;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  onAny(handler: (event: string, ...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

export interface Subscription {
  organizationId: string;
  projectId?: string;
}

type Handler = (payload: unknown) => void;

// Do not ask for a new token more often than this, whatever the server says.
const MIN_REAUTH_INTERVAL_MS = 5000;

// One live connection per browser tab. It keeps track of what the page wants to hear about and
// puts the connection back together after trouble:
//  - after any reconnect it joins the rooms again (the server forgot them when the socket closed);
//  - when the server closes the socket because the access token ran out, or refuses a handshake
//    with "unauthorized", it gets a fresh token first and then connects again.
export class RealtimeClient {
  private socket: SocketLike | undefined;
  private readonly subscriptions = new Map<string, { sub: Subscription; count: number }>();
  private readonly handlers = new Map<string, Set<Handler>>();
  private lastReauth = 0;
  private reauthenticating = false;

  constructor(
    private readonly createSocket: () => SocketLike,
    // Returns a fresh access token, or null when the session is over.
    private readonly refreshToken: () => Promise<string | null>,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.socket) return;
    const socket = this.createSocket();
    this.socket = socket;

    socket.on('connect', () => this.subscriptions.forEach(({ sub }) => this.send(sub)));
    socket.on('disconnect', (reason) => {
      // "io server disconnect" is the server closing the socket on purpose (token expired). The
      // library does not reconnect after that by itself.
      if (reason === 'io server disconnect') void this.reauthenticate();
    });
    socket.on('connect_error', (error) => {
      if (error instanceof Error && error.message === 'unauthorized') void this.reauthenticate();
    });
    socket.onAny((event, ...args) =>
      this.handlers.get(event)?.forEach((handler) => handler(args[0])),
    );
  }

  stop(): void {
    this.socket?.disconnect();
    this.socket = undefined;
  }

  // Joins the rooms of `sub` (now if connected, and again after every reconnect). Every call must
  // be matched by calling the returned function; rooms are left when nobody wants them any more.
  subscribe(sub: Subscription): () => void {
    const key = `${sub.organizationId}:${sub.projectId ?? ''}`;
    const entry = this.subscriptions.get(key);
    if (entry) {
      entry.count++;
    } else {
      this.subscriptions.set(key, { sub, count: 1 });
      if (this.socket?.connected) this.send(sub);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.subscriptions.get(key);
      if (!current) return;
      current.count--;
      if (current.count > 0) return;
      this.subscriptions.delete(key);
      if (sub.projectId && this.socket?.connected) {
        this.socket.emit('unsubscribe', { projectId: sub.projectId });
      }
    };
  }

  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  private send(sub: Subscription): void {
    this.socket?.emit('subscribe', sub);
  }

  private async reauthenticate(): Promise<void> {
    if (this.reauthenticating || !this.socket) return;
    if (this.now() - this.lastReauth < MIN_REAUTH_INTERVAL_MS) return;
    this.reauthenticating = true;
    this.lastReauth = this.now();
    try {
      const token = await this.refreshToken();
      if (token) {
        this.socket?.connect();
      } else {
        // The session is over; the rest of the app is already sending the person to sign in.
        this.stop();
      }
    } finally {
      this.reauthenticating = false;
    }
  }
}
