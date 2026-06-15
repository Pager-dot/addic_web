import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Nav from "../components/Nav";

const TODAY = new Date().toISOString().split("T")[0];

function fmt(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

export default function Journal() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [entry, setEntry] = useState({ body: "", is_clean: false, visibility: "private", exists: false });
  const [history, setHistory] = useState([]);
  const [cleanCount, setCleanCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then(setUser).catch(() => navigate("/login"));
    loadData();
  }, []);

  async function loadData() {
    try {
      const [todayRes, listRes] = await Promise.all([
        api.get("/journal/today"),
        api.get("/journal/"),
      ]);
      setEntry({ body: "", is_clean: todayRes.is_clean, visibility: todayRes.visibility, exists: todayRes.exists });
      setHistory(listRes.entries);
      setCleanCount(listRes.clean_days_last_30);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put(`/journal/${TODAY}`, {
        body: entry.body || null,
        is_clean: entry.is_clean,
        visibility: entry.visibility,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Nav user={user} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Clean-day banner */}
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-medium">Today — {fmt(TODAY)}</p>
          <label className="flex items-center gap-3 cursor-pointer select-none mt-3">
            <div
              onClick={() => setEntry({ ...entry, is_clean: !entry.is_clean })}
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all text-xl ${
                entry.is_clean
                  ? "bg-green-500 border-green-500 text-white"
                  : "border-gray-300 text-gray-300"
              }`}
            >
              {entry.is_clean ? "✓" : "○"}
            </div>
            <div>
              <p className={`font-semibold text-base ${entry.is_clean ? "text-green-700" : "text-gray-500"}`}>
                {entry.is_clean ? "I was clean today" : "Mark today as clean"}
              </p>
              <p className="text-xs text-gray-400">{cleanCount} clean day{cleanCount !== 1 ? "s" : ""} in the last 30</p>
            </div>
          </label>
        </div>

        {/* Journal entry form */}
        <form onSubmit={save} className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
          <p className="text-sm font-medium text-gray-700">How are you feeling?</p>
          <textarea
            rows={5}
            placeholder="Write freely — no one can see this unless you share it..."
            value={entry.body}
            onChange={(e) => setEntry({ ...entry, body: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Visible to:</span>
              <select
                value={entry.visibility}
                onChange={(e) => setEntry({ ...entry, visibility: e.target.value })}
                className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="private">Only me</option>
                <option value="connections">My connections</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              {saved && <span className="text-xs text-green-600 font-medium">Saved!</span>}
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save entry"}
              </button>
            </div>
          </div>
        </form>

        {/* Past entries */}
        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Past entries</h2>
            <div className="space-y-2">
              {history.map((e) => (
                <div
                  key={e.id}
                  className="bg-white border rounded-xl p-4 flex gap-3 items-start shadow-sm"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold mt-0.5 ${
                      e.is_clean ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {e.is_clean ? "✓" : "–"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{fmt(e.entry_date)}</p>
                    {e.body ? (
                      <p className="text-sm text-gray-700 line-clamp-2">{e.body}</p>
                    ) : (
                      <p className="text-sm text-gray-300 italic">No note</p>
                    )}
                  </div>
                  {e.visibility === "connections" && (
                    <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded flex-shrink-0">shared</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
