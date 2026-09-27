import { describe, it, expect, vi, afterEach } from "vitest";
import { authHeader } from "./api";

describe("api auth helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authHeader builds Bearer token', () => {
    expect(authHeader("tok")).toBe("Bearer tok");
  });

  it("login posts username/password JSON to /api/v1/auth/login", async () => {
    const { login } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "jwt-abc", token_type: "bearer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await login("admin", "admin");

    expect(out.access_token).toBe("jwt-abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      username: "admin",
      password: "admin",
    });
  });

  it("apiFetch attaches Authorization header when token given", async () => {
    const { apiFetch } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/v1/metrics", "tok");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/metrics");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer tok",
    );
  });

  it("register posts to /api/v1/auth/register", async () => {
    const { register } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "jwt-new", token_type: "bearer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await register("bob", "password123", "bob@x.com");

    expect(out.access_token).toBe("jwt-new");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/auth/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      username: "bob",
      password: "password123",
      email: "bob@x.com",
    });
  });

  it("fetchMe calls /api/v1/auth/me with token", async () => {
    const { fetchMe } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", username: "bob", is_admin: false, providers: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const me = await fetchMe("tok");
    expect(me.username).toBe("bob");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/auth/me");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("nostrChallenge posts pubkey", async () => {
    const { nostrChallenge } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ challenge: "abc", expires_in: 300 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await nostrChallenge("a".repeat(64));
    expect(out.challenge).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/auth/nostr/challenge");
    expect(JSON.parse(init.body as string)).toEqual({ pubkey: "a".repeat(64) });
  });

  it("nostrVerify posts event", async () => {
    const { nostrVerify } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "jwt-n", token_type: "bearer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const event = {
      id: "i",
      pubkey: "a".repeat(64),
      created_at: 1,
      kind: 27235,
      tags: [],
      content: "c",
      sig: "s",
    };
    const out = await nostrVerify(event);
    expect(out.access_token).toBe("jwt-n");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/auth/nostr/verify");
    expect(JSON.parse(init.body as string)).toEqual({ event });
  });

  it("oauthStart calls provider start endpoint", async () => {
    const { oauthStart } = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_url: "https://x", state: "s" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await oauthStart("google");
    expect(out.state).toBe("s");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/auth/oauth/google/start");
  });
});
