import { Navigate, Route, Routes } from "react-router-dom";
import type { JSX } from "react";
import { useAuth } from "./context/AuthContext";
import Login from "./routes/Login";
import Register from "./routes/Register";
import Profile from "./routes/Profile";
import AdminUsers from "./routes/AdminUsers";
import Dashboard from "./routes/Dashboard";
import Charts from "./routes/Charts";
import ChartPage from "./routes/ChartPage";
import Alerts from "./routes/Alerts";
import Layouts from "./routes/Layouts";
import Compare from "./routes/Compare";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated, loadingUser, user } = useAuth();
  // Only block on first load (no user yet). Background refreshes must keep
  // children mounted, or in-flight form state (e.g. Profile save message)
  // is lost when the route remounts.
  if (loadingUser && user === null) return <p>Loading…</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isAdmin, loadingUser, user } = useAuth();
  if (loadingUser && user === null) return <p>Loading…</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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
      <Route
        path="/charts"
        element={
          <RequireAuth>
            <Charts />
          </RequireAuth>
        }
      />
      <Route
        path="/charts/:chartId"
        element={
          <RequireAuth>
            <ChartPage />
          </RequireAuth>
        }
      />
      <Route
        path="/alerts"
        element={
          <RequireAuth>
            <Alerts />
          </RequireAuth>
        }
      />
      <Route
        path="/layouts"
        element={
          <RequireAuth>
            <Layouts />
          </RequireAuth>
        }
      />
      <Route
        path="/compare"
        element={
          <RequireAuth>
            <Compare />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
