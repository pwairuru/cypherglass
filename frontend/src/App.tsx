import { Navigate, Route, Routes } from "react-router-dom";
import type { JSX } from "react";
import { useAuth } from "./context/AuthContext";
import Login from "./routes/Login";

function HomePlaceholder() {
  const { logout } = useAuth();
  return (
    <div className="shell">
      <h1>CypherGlass Analytics</h1>
      <p>Dashboard lands in Task 6.</p>
      <button className="btn" type="button" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePlaceholder />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
