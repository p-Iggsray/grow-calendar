import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, onSessionEnded, clearSessionEnded } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Whether the session ended under a running app, as opposed to never having
  // been signed in. The login screen says so, because "you are looking at the
  // login screen again" is otherwise an unexplained event.
  const [sessionExpired, setSessionExpired] = useState(false);

  // A 401 on any app route means this session is over. Dropping the user is
  // what swaps the app for the login screen; without it the app sits there
  // looking signed in and empty. See the note at the top of api.js.
  useEffect(() => onSessionEnded(() => {
    setUser(null);
    setSessionExpired(true);
  }), []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
      if (data.user) { clearSessionEnded(); setSessionExpired(false); }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password) => {
    const { user } = await api.login(username, password);
    // Signing in puts the app back in business, so the next 401 is allowed to
    // speak again.
    clearSessionEnded();
    setSessionExpired(false);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    // Leaving on purpose is not an expiry, and must not be explained as one.
    clearSessionEnded();
    setSessionExpired(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
