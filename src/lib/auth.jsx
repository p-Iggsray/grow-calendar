import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [meResult, statusResult] = await Promise.allSettled([
      api.me(),
      api.signupStatus(),
    ]);
    if (meResult.status === "fulfilled") setUser(meResult.value.user);
    else setUser(null);
    if (statusResult.status === "fulfilled") setSignupOpen(statusResult.value.open);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password) => {
    const { user } = await api.login(username, password);
    setUser(user);
    setSignupOpen(false);
  }, []);

  const signup = useCallback(async (username, password) => {
    const { user } = await api.signup(username, password);
    setUser(user);
    setSignupOpen(false);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    const status = await api.signupStatus().catch(() => ({ open: false }));
    setSignupOpen(status.open);
  }, []);

  return (
    <AuthContext.Provider value={{ user, signupOpen, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
