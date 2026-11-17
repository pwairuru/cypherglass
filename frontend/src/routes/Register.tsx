import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SocialLogin from "../components/SocialLogin";

export default function Register() {
  const { register, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await register(username, password, email || undefined);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
        <h1>Create account</h1>
        <label htmlFor="reg-username">
          Username
          <input
            id="reg-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "reg-error" : undefined}
          />
        </label>
        <label htmlFor="reg-email">
          Email (optional)
          <input
            id="reg-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "reg-error" : undefined}
          />
        </label>
        <label htmlFor="reg-password">
          Password
          <input
            id="reg-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "reg-error" : undefined}
          />
        </label>
        {error && <p className="error" id="reg-error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
        <p>
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
      <SocialLogin onNostrToken={onNostrToken} />
      </div>
    </div>
  );
}
