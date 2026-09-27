import { describe, expect, it } from "vitest";
import { normalizePubkey, npubToHex } from "./nostr";

// Test vector: fixed secret -> known pubkey, cross-checked against the
// backend coincurve verifier in backend/tests/test_nostr.py style checks.
const SK_HEX =
  "1111111111111111111111111111111111111111111111111111111111111111";
// x-only pubkey for 0x11..11 (computed once via noble, pinned here)
const PUB_HEX = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";

describe("normalizePubkey", () => {
  it("accepts lowercase hex", () => {
    expect(normalizePubkey(PUB_HEX)).toBe(PUB_HEX);
  });

  it("accepts uppercase hex and surrounding whitespace", () => {
    expect(normalizePubkey(`  ${PUB_HEX.toUpperCase()} \n`)).toBe(PUB_HEX);
  });

  it("strips inner whitespace users copy by accident", () => {
    const spaced = `${PUB_HEX.slice(0, 32)} ${PUB_HEX.slice(32)}`;
    expect(normalizePubkey(spaced)).toBe(PUB_HEX);
  });

  it("rejects short/garbage input with a helpful message", () => {
    expect(() => normalizePubkey("abc")).toThrow(/64 hex chars or an npub/);
    expect(() => normalizePubkey("")).toThrow(/64 hex chars or an npub/);
    expect(() => normalizePubkey("npub1xyz")).toThrow(/npub/i);
  });
});

describe("npub round-trip", () => {
  it("decodes a real npub address to hex", async () => {
    const { bech32 } = await import("@scure/base");
    const bytes = new Uint8Array(Buffer.from(PUB_HEX, "hex"));
    const npub = bech32.encode("npub", bech32.toWords(bytes), 200);
    expect(npub.startsWith("npub1")).toBe(true);
    expect(npubToHex(npub)).toBe(PUB_HEX);
    expect(normalizePubkey(npub)).toBe(PUB_HEX);
    expect(normalizePubkey(npub.toUpperCase())).toBe(PUB_HEX);
  });

  it("rejects wrong-hrp bech32", () => {
    expect(() => npubToHex("a".repeat(64))).toThrow();
  });
});

export { SK_HEX };
