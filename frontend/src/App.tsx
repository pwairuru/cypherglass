import { Navigate, Route, Routes } from "react-router-dom";
import type { JSX } from "react";
import { useAuth } from "./context/AuthContext";
import Login from "./routes/Login";
import Register from "./routes/Register";
import Profile from "./routes/Profile";
import AdminUsers from "./routes/AdminUsers";
import Dashboard from "./routes/Dashboard";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated, loadingUser, user } = useAuth();
  if (loadingUser || (user === null && isAuthenticated)) return <p>Loading…</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isAdmin, loadingUser, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (loadingUser || (user === null && isAuthenticated)) return <p>Loading…</p>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div id="main">
        <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAdmin>
            <AdminUsers />
          </RequireAdmin>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
