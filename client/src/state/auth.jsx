/**
 * Authentication state.
 *
 * Context rather than a store: the signed-in user and the token are the only
 * genuinely global values in the app, and they change rarely.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { api, setToken, getToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // A stored token is only a claim; verify it against the server on load so a
  // revoked or expired session does not present a signed-in shell.
  useEffect(() => {
    if (!getToken()) return;

    const controller = new AbortController();

    api.auth
      .me(controller.signal)
      .then(({ user: me }) => setUser(me))
      .catch((error) => {
        if (error.name !== 'AbortError') setToken(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isSignedIn: Boolean(user),
      isManager: user?.role === 'MANAGER',

      async signIn(credentials) {
        const { user: me, token } = await api.auth.login(credentials);
        setToken(token);
        setUser(me);
        return me;
      },

      async register(details) {
        const { user: me, token } = await api.auth.register(details);
        setToken(token);
        setUser(me);
        return me;
      },

      signOut() {
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
