export const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://localhost:8002";

export interface TokenOut {
  access_token: string;
  token_type: string;
}

export interface MeOut {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  npub: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  providers: string[];
}

export interface UserOut {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  npub: string | null;
  is_active: boolean;
  is_admin: boolean;
}

export interface MeUpdate {
  display_name?: string;
  avatar_url?: string;
  email?: string;
}

export interface AdminUserUpdate {
  is_active?: boolean;
  is_admin?: boolean;
  display_name?: string;
}

export interface NostrChallengeOut {
  challenge: string;
  expires_in: number;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: unknown[];
  content: string;
  sig: string;
}

export interface OAuthStartOut {
  auth_url: string;
  state: string;
}

export type OAuthProvider = "google" | "github";

export function authHeader(token: string): string {
  return `Bearer ${token}`;
}

export async function apiFetch<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = authHeader(token);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    if (!token) {
      throw new Error("Authentication failed (401) — check credentials and try again");
    }
    throw new Error("Unauthorized (401) — session expired, please log in again");
  }
  if (!res.ok) {
    // Surface safe backend detail (validation, conflict) without raw dump.
    // React escapes output, but we still omit `input` echo to avoid
    // password/username reflection + limit to known-safe shapes.
    try {
      const data = (await res.json()) as { detail?: unknown };
      const detail = data?.detail;
      if (typeof detail === "string" && detail.length > 0 && detail.length < 200) {
        if (/^[A-Za-z0-9 _\-.,:()']+$/.test(detail)) {
          throw new Error(`Request failed (${res.status}): ${detail}`);
        }
      }
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { loc?: unknown; msg?: unknown };
        const locParts = Array.isArray(first?.loc) ? (first.loc as unknown[]) : [];
        const rawField = locParts.length ? String(locParts[locParts.length - 1]) : "field";
        const rawMsg = typeof first?.msg === "string" ? first.msg : "invalid value";
        const safeField = rawField.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "field";
        const safeMsg = rawMsg.slice(0, 200);
        throw new Error(`Invalid ${safeField}: ${safeMsg} (${res.status})`);
      }
    } catch (e) {
      if (e instanceof Error && (/^Invalid [A-Za-z0-9_]+:/.test(e.message) || /^Request failed \(\d+\): /.test(e.message))) {
        throw e;
      }
      // Non-JSON body or unsafe detail -> fall through to generic.
    }
    // Sanitized: status + path only, no raw backend detail (avoids XSS/info leak).
    throw new Error(`Request failed (${res.status})`);
  }
  const contentType = res.headers?.get?.("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `API ${path}: expected JSON but got HTML from ${API_BASE} — wrong backend port or backend down?`,
    );
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `API ${path}: expected JSON but got non-JSON from ${API_BASE} — wrong backend port or backend down?`,
      );
    }
    throw err;
  }
}

function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  return apiFetch<T>(path, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function login(
  username: string,
  password: string,
): Promise<TokenOut> {
  return postJson<TokenOut>("/api/v1/auth/login", { username, password });
}

export async function register(
  username: string,
  password: string,
  email?: string,
): Promise<TokenOut> {
  return postJson<TokenOut>("/api/v1/auth/register", {
    username,
    password,
    ...(email ? { email } : {}),
  });
}

export async function fetchMe(token: string): Promise<MeOut> {
  return apiFetch<MeOut>("/api/v1/auth/me", token);
}

export async function updateMe(token: string, data: MeUpdate): Promise<MeOut> {
  return apiFetch<MeOut>("/api/v1/auth/me", token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function changePassword(
  token: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await postJson("/api/v1/auth/change-password", {
    old_password: oldPassword,
    new_password: newPassword,
  }, token);
}

export async function listUsers(token: string): Promise<UserOut[]> {
  return apiFetch<UserOut[]>("/api/v1/auth/users", token);
}

export async function updateUser(
  token: string,
  id: string,
  data: AdminUserUpdate,
): Promise<UserOut> {
  return apiFetch<UserOut>(`/api/v1/auth/users/${id}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function nostrChallenge(pubkey: string): Promise<NostrChallengeOut> {
  return postJson<NostrChallengeOut>("/api/v1/auth/nostr/challenge", { pubkey });
}

export async function nostrVerify(event: NostrEvent): Promise<TokenOut> {
  return postJson<TokenOut>("/api/v1/auth/nostr/verify", { event });
}

export async function oauthStart(provider: OAuthProvider): Promise<OAuthStartOut> {
  return apiFetch<OAuthStartOut>(`/api/v1/auth/oauth/${provider}/start`);
}
