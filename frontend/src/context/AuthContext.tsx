import { createContext, useContext, useState, type ReactNode } from "react";
import { login as loginRequest } from "../lib/api";

const STORAGE_KEY = "cypherglass_token";

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  async function login(username: string, password: string): Promise<void> {
    const out = await loginRequest(username, password);
    localStorage.setItem(STORAGE_KEY, out.access_token);
    setToken(out.access_token);
  }

  function logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: token !== null, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
