import { useState } from "react";
import { nostrChallenge, nostrVerify, type NostrEvent } from "../lib/api";

// QR choice: qrcode.react + nostr-tools NOT installed (`npm ls` empty) and
// no network for installs in this env, so no QR image dep added. Fallback
// per brief: show nostrconnect:// URI text + copy button. If qrcode.react
// is added later, render <QRCodeSVG value={uri}/> in the QR panel below.

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: Record<string, unknown>) => Promise<NostrEvent>;
    };
  }
}

function buildNostrConnectUri(pubkey: string, challenge: string): string {
  const relay = encodeURIComponent("wss://relay.cypherglass.app");
  return `nostrconnect://${pubkey}?relay=${relay}&challenge=${encodeURIComponent(challenge)}`;
}

export default function NostrLogin({ onToken }: { onToken: (t: string) => void }) {
  const [mode, setMode] = useState<"extension" | "qr">("extension");
  const [pubkey, setPubkey] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [signedJson, setSignedJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loginWithExtension(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      if (!window.nostr?.getPublicKey || !window.nostr?.signEvent) {
        throw new Error("No Nostr extension found. Use QR / mobile instead.");
      }
      const pk = await window.nostr.getPublicKey();
      const { challenge: ch } = await nostrChallenge(pk);
      const event = await window.nostr.signEvent({
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: ch,
        pubkey: pk,
      });
      const out = await nostrVerify(event);
      onToken(out.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nostr login failed");
    } finally {
      setPending(false);
    }
  }

  async function fetchChallenge(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const pk = pubkey.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(pk)) throw new Error("Invalid pubkey (need 64 hex chars)");
      const { challenge: ch } = await nostrChallenge(pk);
      setChallenge(ch);
      setUri(buildNostrConnectUri(pk, ch));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge failed");
    } finally {
      setPending(false);
    }
  }

  async function verifySignedEvent(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const event = JSON.parse(signedJson) as NostrEvent;
      const out = await nostrVerify(event);
      onToken(out.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setPending(false);
    }
  }

  async function copyUri(): Promise<void> {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
    } catch {
      setError("Copy failed — select the URI text manually");
    }
  }

  return (
    <div className="nostr-login">
      <h2>Sign in with Nostr</h2>
      <div role="group" aria-label="Nostr login method">
        <button
          type="button"
          className={mode === "extension" ? "btn is-active" : "btn"}
          onClick={() => setMode("extension")}
        >
          Extension
        </button>
        <button
          type="button"
          className={mode === "qr" ? "btn is-active" : "btn"}
          onClick={() => setMode("qr")}
        >
          QR / mobile
        </button>
      </div>

      {mode === "extension" ? (
        <div>
          <p>Use a browser Nostr extension (NIP-07) to sign the login challenge.</p>
          <button className="btn" type="button" onClick={() => void loginWithExtension()} disabled={pending}>
            {pending ? "Signing…" : "Sign in with Nostr extension"}
          </button>
        </div>
      ) : (
        <div>
          <p>Mobile wallet: enter your pubkey, scan or copy the nostrconnect URI, sign the challenge, paste the signed event.</p>
          <label>
            Pubkey (hex)
            <input
              className="input"
              value={pubkey}
              onChange={(e) => setPubkey(e.target.value)}
              placeholder="64 hex chars"
            />
          </label>
          <button className="btn" type="button" onClick={() => void fetchChallenge()} disabled={pending}>
            Get login challenge
          </button>
          {challenge && (
            <p>
              Challenge: <code>{challenge}</code>
            </p>
          )}
          {uri && (
            <div>
              <p>nostrconnect URI (QR image needs qrcode.react — not installed):</p>
              <code style={{ wordBreak: "break-all" }}>{uri}</code>
              <div>
                <button className="btn" type="button" onClick={() => void copyUri()}>
                  {copied ? "Copied" : "Copy URI"}
                </button>
              </div>
            </div>
          )}
          <label>
            Signed event JSON
            <textarea
              className="input"
              value={signedJson}
              onChange={(e) => setSignedJson(e.target.value)}
              placeholder='{"id":...,"pubkey":...,"sig":...}'
              rows={4}
            />
          </label>
          <button className="btn" type="button" onClick={() => void verifySignedEvent()} disabled={pending || !signedJson}>
            Verify and sign in
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
