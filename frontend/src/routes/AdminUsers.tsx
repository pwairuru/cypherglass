import { useEffect, useState } from "react";
import { listUsers, updateUser, type UserOut } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    listUsers(token)
      .then(setUsers)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load users"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  async function toggle(id: string, field: "is_active" | "is_admin", value: boolean): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      const updated = await updateUser(token, id, { [field]: value });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (loading) return <p>Loading users…</p>;

  return (
    <div className="admin-users">
      <h1>Users</h1>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Active</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.email ?? "—"}</td>
              <td>
                <button
                  type="button"
                  onClick={() => void toggle(u.id, "is_active", !u.is_active)}
                >
                  {u.is_active ? "Deactivate" : "Activate"}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => void toggle(u.id, "is_admin", !u.is_admin)}
                >
                  {u.is_admin ? "Demote" : "Promote"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
