import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import NostrLogin from "./NostrLogin";
import { GitHubIcon, GoogleIcon, NostrIcon } from "./SocialIcons";

/** Shared social sign-in row (Google / GitHub / Nostr) for login + register. */
export default function SocialLogin({
  onNostrToken,
}: {
  onNostrToken: (accessToken: string) => Promise<void>;
}) {
  const { oauthLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showNostr, setShowNostr] = useState(false);

  async function onOAuth(provider: "google" | "github"): Promise<void> {
    setError(null);
    try {
      await oauthLogin(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
    }
  }

  async function onToken(accessToken: string): Promise<void> {
    setError(null);
    try {
      await onNostrToken(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nostr sign-in failed");
    }
  }

  return (
    <div>
      <p className="social-divider">or continue with</p>
      <div className="social-login">
        <button
          className="btn btn-icon social-btn"
          type="button"
          onClick={() => void onOAuth("google")}
          aria-label="Continue with Google"
          title="Continue with Google"
        >
          <GoogleIcon />
        </button>
        <button
          className="btn btn-icon social-btn"
          type="button"
          onClick={() => void onOAuth("github")}
          aria-label="Continue with GitHub"
          title="Continue with GitHub"
        >
          <GitHubIcon />
        </button>
        <button
          className={showNostr ? "btn btn-icon social-btn is-active" : "btn btn-icon social-btn"}
          type="button"
          onClick={() => setShowNostr((v) => !v)}
          aria-label="Continue with Nostr"
          title={showNostr ? "Hide Nostr login" : "Continue with Nostr"}
          aria-expanded={showNostr}
        >
          <NostrIcon />
        </button>
      </div>
      {showNostr && <NostrLogin onToken={(t) => void onToken(t)} />}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
