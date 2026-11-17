import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  login as loginRequest,
  nostrVerify,
  oauthStart,
  register as registerRequest,
  type MeOut,
  type NostrEvent,
  type OAuthProvider,
} from "../lib/api";

const STORAGE_KEY = "cypherglass_token";

interface AuthContextValue {
  token: string | null;
  user: MeOut | null;
  providers: string[];
  loadingUser: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  loginWithToken: (accessToken: string) => Promise<void>;
  loginWithNostrEvent: (event: NostrEvent) => Promise<void>;
  oauthLogin: (provider: OAuthProvider) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<MeOut | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const refreshUser = useCallback(async (): Promise<void> => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (!t) {
      setUser(null);
      return;
    }
    setLoadingUser(true);
    try {
      const me = await fetchMe(t);
      setUser(me);
    } catch (e) {
      // 401/invalid token -> clear so isAuthenticated goes false (no stale auth).
      if (e instanceof Error && /401|Invalid token|Not authenticated/i.test(e.message)) {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
      }
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (token) void refreshUser();
    else setUser(null);
  }, [token, refreshUser]);

  function storeToken(accessToken: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, accessToken);
    } catch {
      /* private mode: token stays in memory only */
    }
    setToken(accessToken);
  }

  async function loginWithToken(accessToken: string): Promise<void> {
    storeToken(accessToken);
    try {
      const me = await fetchMe(accessToken);
      setUser(me);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setToken(null);
      setUser(null);
      throw new Error("Invalid token");
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const out = await loginRequest(username, password);
    await loginWithToken(out.access_token);
  }

  async function register(
    username: string,
    password: string,
    email?: string,
  ): Promise<void> {
    const out = await registerRequest(username, password, email);
    await loginWithToken(out.access_token);
  }

  async function loginWithNostrEvent(event: NostrEvent): Promise<void> {
    const out = await nostrVerify(event);
    await loginWithToken(out.access_token);
  }

  async function oauthLogin(provider: OAuthProvider): Promise<void> {
    const { auth_url } = await oauthStart(provider);
    window.location.href = auth_url;
  }

  function logout(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
  }

  // safeGet kept for future storage reads (private-mode safe).

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        providers: user?.providers ?? [],
        loadingUser,
        isAuthenticated: token !== null && user !== null,
        isAdmin: user?.is_admin === true,
        login,
        register,
        loginWithToken,
        loginWithNostrEvent,
        oauthLogin,
        refreshUser,
        logout,
      }}
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
