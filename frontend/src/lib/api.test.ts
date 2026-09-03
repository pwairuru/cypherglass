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
});
