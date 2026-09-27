import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NostrLogin from "../components/NostrLogin";

export default function Login() {
  const { login, loginWithToken, oauthLogin } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showNostr, setShowNostr] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  async function onOAuth(provider: "google" | "github"): Promise<void> {
    setError(null);
    try {
      await oauthLogin(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
    }
  }

  async function onNostrToken(accessToken: string): Promise<void> {
    await loginWithToken(accessToken);
    navigate("/", { replace: true });
  }

  return (
    <div className="login-page">
      <form className="card" onSubmit={onSubmit}>
        <h1>CypherGlass login</h1>
        <label>
          Username
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p>
          No account? <Link to="/register">Create one</Link>
        </p>
      </form>
      <div className="card">
        <button className="btn" type="button" onClick={() => void onOAuth("google")}>
          Sign in with Google
        </button>
        <button className="btn" type="button" onClick={() => void onOAuth("github")}>
          Sign in with GitHub
        </button>
        <button className="btn" type="button" onClick={() => setShowNostr((v) => !v)}>
          {showNostr ? "Hide Nostr login" : "Sign in with Nostr"}
        </button>
        {showNostr && <NostrLogin onToken={(t) => void onNostrToken(t)} />}
      </div>
    </div>
  );
}
