import { useState, useRef, useEffect } from "react";
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
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const desktopMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    function handler(e) {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(e.target)) setDesktopMenuOpen(false);
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) setMobileMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function logout() {
    try { await api.post("/auth/logout"); } catch {}
    if (onLogout) onLogout();
    navigate("/login");
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api.delete("/auth/account");
      navigate("/login");
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
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
            {/* Username menu */}
            <div className="relative" ref={desktopMenuRef}>
              <button
                onClick={() => setDesktopMenuOpen((o) => !o)}
                className="text-sm text-gray-500 hover:text-gray-800 font-medium"
              >
                {user.username} ▾
              </button>
              {desktopMenuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Logout
                  </button>
                  <hr className="my-1 border-gray-100" />
                  <button
                    onClick={() => { setDesktopMenuOpen(false); setShowDeleteConfirm(true); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                  >
                    Delete account
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Mobile top bar ── */}
      <nav className="md:hidden bg-white border-b px-4 py-3 flex justify-between items-center sticky top-0 z-40">
        <Link to="/" className="font-bold text-gray-800">Recovery</Link>
        {user && (
          <div className="relative" ref={mobileMenuRef}>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="text-sm text-gray-400"
            >
              {user.username} ▾
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Logout
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => { setMobileMenuOpen(false); setShowDeleteConfirm(true); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                >
                  Delete account
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t z-50 flex">
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

      {/* ── Delete account modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Delete your account?</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              This will permanently delete:
            </p>
            <ul className="text-sm text-gray-500 list-disc list-inside space-y-1">
              <li>Your profile and login</li>
              <li>All your journal entries</li>
              <li>All your connections</li>
              <li>All clubs you created (and their messages)</li>
              <li>Your messages in other clubs</li>
            </ul>
            <p className="text-sm font-medium text-red-600">This cannot be undone.</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
