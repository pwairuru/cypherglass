import { sha256 } from "@noble/hashes/sha2.js";
import { hashes, schnorr, utils } from "@noble/secp256k1";

hashes.sha256 = sha256;

const enc = new TextEncoder();
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const unhex = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "hex"));

export interface NostrDraft {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

export interface SignedNostrEvent extends NostrDraft {
  id: string;
  sig: string;
}

export function genKey(): { skHex: string; pubHex: string } {
  const sk = utils.randomSecretKey();
  return { skHex: hex(sk), pubHex: hex(schnorr.getPublicKey(sk)) };
}

export function eventId(ev: NostrDraft): string {
  const canonical = JSON.stringify([
    0,
    ev.pubkey,
    ev.created_at,
    ev.kind,
    ev.tags,
    ev.content,
  ]);
  return hex(sha256(enc.encode(canonical)));
}

export function signEvent(skHex: string, ev: NostrDraft): SignedNostrEvent {
  const id = eventId(ev);
  const sig = hex(schnorr.sign(unhex(id), unhex(skHex)));
  return { ...ev, id, sig };
}
