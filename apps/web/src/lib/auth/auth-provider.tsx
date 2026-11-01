'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setSessionEndedHandler, unwrap } from '../api/client';
import { refreshAccessToken } from './refresh';
import { tokenStore } from './token-store';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface Credentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  status: Status;
  // True when the person chose to sign out (as opposed to the session simply running out). Then
  // there is no "page you wanted" to come back to after the next sign-in.
  signedOut: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (input: Credentials & { name: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // "loading" until we know whether the refresh cookie still gives us a session. Pages must not
  // decide anything (redirect to login, show data) before that is known.
  const [status, setStatus] = useState<Status>('loading');
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let active = true;

    // Called by the API client when a token cannot be renewed any more.
    setSessionEndedHandler(() => {
      tokenStore.clear();
      queryClient.clear();
      setStatus('unauthenticated');
    });

    // On every page load the in-memory token is gone; try to get one with the refresh cookie.
    void refreshAccessToken().then((token) => {
      if (active) {
        setStatus(token ? 'authenticated' : 'unauthenticated');
      }
    });

    return () => {
      active = false;
      setSessionEndedHandler(undefined);
    };
  }, [queryClient]);

  const login = useCallback(async (body: Credentials) => {
    const session = await unwrap(api.POST('/api/v1/auth/login', { body }));
    tokenStore.set(session.accessToken);
    setSignedOut(false);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (body: Credentials & { name: string }) => {
    const session = await unwrap(api.POST('/api/v1/auth/register', { body }));
    tokenStore.set(session.accessToken);
    setSignedOut(false);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.POST('/api/v1/auth/logout');
    } finally {
      // Even if the server could not be reached, this device must forget the session.
      tokenStore.clear();
      queryClient.clear();
      setSignedOut(true);
      setStatus('unauthenticated');
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, signedOut, login, register, logout }),
    [status, signedOut, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
