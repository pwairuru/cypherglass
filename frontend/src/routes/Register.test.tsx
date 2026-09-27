import { test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Register from "./Register";
import Login from "./Login";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    register: vi.fn(),
    login: vi.fn(),
    loginWithToken: vi.fn(),
    oauthLogin: vi.fn(),
  }),
}));

for (const [name, Page] of [["register", Register], ["login", Login]] as const) {
  test(`${name} page offers Google/GitHub/Nostr inside the same card`, () => {
    const { container } = render(
      <MemoryRouter>
        {Page === Register ? <Register /> : <Login />}
      </MemoryRouter>,
    );
    const card = container.querySelector(".login-page .card");
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByRole("button", { name: /continue with google/i })).toBeDefined();
    expect(scope.getByRole("button", { name: /continue with github/i })).toBeDefined();
    expect(scope.getByRole("button", { name: /continue with nostr/i })).toBeDefined();
  });
}
