'use client';

import { io } from 'socket.io-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { refreshAccessToken } from '../auth/refresh';
import { tokenStore } from '../auth/token-store';
import { useAuth } from '../auth/auth-provider';
import { RealtimeClient, type SocketLike } from './client';

// The WebSocket goes straight to the API, not through the Next.js proxy that carries the REST
// calls: that proxy is not meant for long-lived connections. In production set
// NEXT_PUBLIC_REALTIME_URL; locally the API is on port 3001 of the same host.
function realtimeUrl(): string {
  return (
    process.env.NEXT_PUBLIC_REALTIME_URL ??
    `${window.location.protocol}//${window.location.hostname}:3001`
  );
}

function createSocket(): SocketLike {
  return io(realtimeUrl(), {
    // Called on every (re)connect, so a reconnect after a token refresh sends the new token.
    auth: (send) => send({ token: tokenStore.get() ?? '' }),
    transports: ['websocket'],
    reconnectionDelayMax: 10_000,
  });
}

const RealtimeContext = createContext<RealtimeClient | null>(null);

// One connection for the whole signed-in area: opened when the person is signed in, closed when
// they are not.
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [client] = useState(() => new RealtimeClient(createSocket, refreshAccessToken));

  useEffect(() => {
    if (status !== 'authenticated') return;
    client.start();
    return () => client.stop();
  }, [status, client]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeClient(): RealtimeClient | null {
  return useContext(RealtimeContext);
}
