import { useState, type FormEvent } from "react";
import { changePassword, updateMe } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { token, user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSaveProfile(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setMsg(null);
    setPending(true);
    try {
      if (displayName.length > 64) throw new Error("Display name max 64 chars");
      await updateMe(token, {
        display_name: displayName || undefined,
        avatar_url: avatarUrl || undefined,
        email: email || undefined,
      });
      await refreshUser();
      setMsg("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  async function onChangePassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setMsg(null);
    setPending(true);
    try {
      await changePassword(token, oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setMsg("Password changed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="profile-page">
      <h1>Profile</h1>
      {user && (
        <div className="card">
          <p>Username: {user.username}</p>
          {user.display_name && <p>Display name: {user.display_name}</p>}
          {user.npub && <p>npub: {user.npub}</p>}
          {user.providers.length > 0 && <p>Linked: {user.providers.join(", ")}</p>}
        </div>
      )}
      <form className="card" onSubmit={onSaveProfile}>
        <h2>Edit profile</h2>
        <label>
          Display name (max 64)
          <input
            className="input"
            value={displayName}
            maxLength={64}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label>
          Avatar URL
          <input
            className="input"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          Save profile
        </button>
      </form>
      <form className="card" onSubmit={onChangePassword}>
        <h2>Change password</h2>
        <label>
          Old password
          <input
            className="input"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          Change password
        </button>
      </form>
      {msg && <p>{msg}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
