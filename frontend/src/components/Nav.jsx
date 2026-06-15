import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";

const TABS = [
  { label: "Home", path: "/" },
  { label: "Journal", path: "/journal" },
  { label: "Friends", path: "/friends" },
];

export default function Nav({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  async function logout() {
    try { await api.post("/auth/logout"); } catch {}
    if (onLogout) onLogout();
    navigate("/login");
  }

  const active = (path) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <>
      {/* ── Desktop top nav ── */}
      <nav className="hidden md:flex bg-white border-b px-6 py-3 justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-gray-800 text-base">Recovery</Link>
          {TABS.map((t) => (
            <Link
              key={t.path}
              to={t.path}
              className={`text-sm font-medium transition-colors ${
                active(t.path) ? "text-blue-600" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.username}</span>
            <button onClick={logout} className="text-sm text-red-500 hover:underline">
              Logout
            </button>
          </div>
        )}
      </nav>

      {/* ── Mobile top bar ── */}
      <nav className="md:hidden bg-white border-b px-4 py-3 flex justify-between items-center sticky top-0 z-40">
        <Link to="/" className="font-bold text-gray-800">Recovery</Link>
        {user && <span className="text-sm text-gray-400">{user.username}</span>}
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t z-50 flex safe-area-bottom">
        {TABS.map((t) => (
          <Link
            key={t.path}
            to={t.path}
            className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
              active(t.path) ? "text-blue-600" : "text-gray-400"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <button
          onClick={logout}
          className="flex-1 py-3 text-center text-xs font-medium text-red-400"
        >
          Out
        </button>
      </div>
    </>
  );
}
