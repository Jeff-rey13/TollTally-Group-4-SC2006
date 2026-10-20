import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role, UserDto } from '@tolltally/shared';
import { setSessionExpiredHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import { Loading, Page } from '../components/ui';

interface AuthState {
  user: UserDto | null;
  loading: boolean;
  setUser: (user: UserDto | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the signed-in user for the whole app and reacts to session expiry.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    authApi
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => setSessionExpiredHandler(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      setUser,
      signOut: async () => {
        await authApi.logout();
        setUser(null);
      },
    }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * Route guard: sends anonymous users to Sign in and users of the wrong role to their own home screen.
 * This is a convenience only; the server enforces access control.
 */
export function RequireAuth({ role }: { role?: Role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <Page>
        <Loading what="Checking your session" />
      </Page>
    );
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role)
    return <Navigate to={user.role === 'ADMINISTRATOR' ? '/admin' : '/app'} replace />;
  return <Outlet />;
}
