export const API_BASE = "http://localhost:8000";

export interface TokenOut {
  access_token: string;
  token_type: string;
}

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
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status} ${path}: ${detail}`);
  }
  return (await res.json()) as T;
}

export async function login(
  username: string,
  password: string,
): Promise<TokenOut> {
  return apiFetch<TokenOut>("/api/v1/auth/login", undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}
