import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    loginWithToken: vi.fn(),
    oauthLogin: vi.fn(),
  }),
}));

test("social signin uses icon buttons, not large text buttons", () => {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: /continue with google/i })).toBeDefined();
  expect(screen.getByRole("button", { name: /continue with github/i })).toBeDefined();
  expect(screen.getByRole("button", { name: /continue with nostr/i })).toBeDefined();
  expect(screen.queryByText("Sign in with Google")).toBeNull();
  expect(screen.queryByText("Sign in with GitHub")).toBeNull();
});
