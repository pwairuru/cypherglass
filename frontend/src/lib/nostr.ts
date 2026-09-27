import { bech32 } from "@scure/base";

const HEX64 = /^[0-9a-f]{64}$/;

const HEX_DIGITS = "0123456789abcdef";

function bytesToHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) {
    out += HEX_DIGITS[b[i] >> 4] + HEX_DIGITS[b[i] & 15];
  }
  return out;
}

/** Decode a NIP-19 npub address to 64-char hex. Throws on invalid input. */
export function npubToHex(npub: string): string {
  const normalized = npub.trim().toLowerCase().replace(/\s+/g, "");
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32.decode(normalized, 200);
  } catch {
    throw new Error("Invalid npub address");
  }
  if (decoded.prefix !== "npub") {
    throw new Error("Not an npub address (need npub1… or 64 hex chars)");
  }
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== 32) {
    throw new Error("Invalid npub address (wrong length)");
  }
  return bytesToHex(bytes);
}

/**
 * Accept what users actually paste: 64 hex chars (any case, stray
 * whitespace ok) or a NIP-19 npub1… address. Returns lowercase hex.
 */
export function normalizePubkey(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, "");
  if (cleaned.startsWith("npub1")) {
    return npubToHex(cleaned);
  }
  if (!HEX64.test(cleaned)) {
    throw new Error("Invalid pubkey — paste 64 hex chars or an npub1… address");
  }
  return cleaned;
}
