import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NostrLogin from "./NostrLogin";

test("shows extension and QR options", () => {
  render(<NostrLogin onToken={() => {}} />);
  // getAllBy*: component legitimately mentions "nostr" in several places
  expect(screen.getAllByText(/nostr/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/qr|mobile/i).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /extension/i }).length).toBeGreaterThan(0);
});
