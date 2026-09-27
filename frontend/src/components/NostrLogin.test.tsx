import { afterEach, test, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NostrLogin from "./NostrLogin";

afterEach(() => cleanup());

vi.mock("../lib/api", () => ({
  nostrChallenge: vi.fn(async () => ({
    challenge: "test-challenge-1234567890",
    expires_in: 300,
  })),
  nostrVerify: vi.fn(),
}));

test("shows extension and QR options", () => {
  render(<NostrLogin onToken={() => {}} />);
  // getAllBy*: component legitimately mentions "nostr" in several places
  expect(screen.getAllByText(/nostr/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/qr|mobile/i).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /extension/i }).length).toBeGreaterThan(0);
});

test("QR tab renders a scannable code after challenge", async () => {
  render(<NostrLogin onToken={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: /qr \/ mobile/i })[0]);
  fireEvent.change(screen.getByPlaceholderText(/64 hex chars/), {
    target: { value: "a".repeat(64) },
  });
  fireEvent.click(screen.getByRole("button", { name: /get login challenge/i }));
  expect(
    await screen.findByRole("img", { name: /nostrconnect login qr code/i }),
  ).toBeDefined();
});
