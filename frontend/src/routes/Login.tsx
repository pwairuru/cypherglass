import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SocialLogin from "../components/SocialLogin";

export default function Login() {
  const { login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  async function onNostrToken(accessToken: string): Promise<void> {
    await loginWithToken(accessToken);
    navigate("/", { replace: true });
  }

  return (
    <div className="login-page">
      <div className="card">
        <form className="auth-form" onSubmit={onSubmit}>
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
        <SocialLogin onNostrToken={onNostrToken} />
      </div>
    </div>
  );
}
