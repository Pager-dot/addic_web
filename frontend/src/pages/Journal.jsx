import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Nav from "../components/Nav";

const TODAY = new Date().toISOString().split("T")[0];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function fmt(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function buildGrid(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function CalendarPanel({ calData }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState({});

  const fetchMonth = useCallback(async (y, m) => {
    try {
      const rows = await api.get(`/journal/calendar?year=${y}&month=${m}`);
      const map = {};
      rows.forEach((r) => { map[r.entry_date] = r.is_clean; });
      setEntries(map);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchMonth(year, month); }, [year, month, fetchMonth]);
  useEffect(() => { fetchMonth(year, month); }, [calData]);

  function prev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (year === now.getFullYear() && month >= now.getMonth() + 1) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const cells = buildGrid(year, month);
  const cleanDays = Object.values(entries).filter(Boolean).length;

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none transition-colors">‹</button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">{MONTHS[month - 1]} {year}</p>
          <p className="text-xs text-gray-400">{cleanDays} clean day{cleanDays !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={next}
          disabled={isCurrentMonth}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none transition-colors disabled:opacity-30"
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const dayNum = parseInt(dateStr.split("-")[2], 10);
          const isToday = dateStr === TODAY;
          const hasEntry = dateStr in entries;
          const isClean = entries[dateStr] === true;
          const isFuture = dateStr > TODAY;

          let cls = "w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs transition-all ";
          if (isToday) {
            cls += isClean
              ? "bg-green-500 text-white font-bold ring-2 ring-green-300 ring-offset-1"
              : "ring-2 ring-blue-400 ring-offset-1 text-blue-600 font-bold";
          } else if (isFuture) {
            cls += "text-gray-200";
          } else if (isClean) {
            cls += "bg-green-100 text-green-700 font-medium";
          } else if (hasEntry) {
            cls += "bg-red-50 text-red-400";
          } else {
            cls += "text-gray-300";
          }

          return (
            <div key={dateStr} className="flex justify-center py-0.5">
              <div className={cls} title={isFuture ? "" : isClean ? "Clean" : hasEntry ? "Not clean" : "No entry"}>
                {dayNum}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Clean
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full bg-red-200 inline-block" /> Not clean
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" /> No entry
        </span>
      </div>
    </div>
  );
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
  const [calTrigger, setCalTrigger] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);

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
      setCalTrigger(t => t + 1);
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

        {/* Clean-day toggle card — flips to calendar */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          {/* Card header — always visible */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              {showCalendar ? "Your progress" : `Today — ${fmt(TODAY)}`}
            </p>
            <button
              onClick={() => setShowCalendar(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
            >
              {showCalendar ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Today
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Calendar
                </>
              )}
            </button>
          </div>

          {/* Animated panels */}
          <div className="relative px-5 pb-5">
            {/* Clean-day toggle panel */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                showCalendar
                  ? "opacity-0 -translate-x-4 pointer-events-none absolute inset-x-5"
                  : "opacity-100 translate-x-0"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  onClick={() => setEntry({ ...entry, is_clean: !entry.is_clean })}
                  className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all text-xl cursor-pointer ${
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
              </div>
            </div>

            {/* Calendar panel */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                showCalendar
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-4 pointer-events-none absolute inset-x-5"
              }`}
            >
              <CalendarPanel calData={calTrigger} />
            </div>

            {/* Spacer so the card doesn't collapse when calendar is hidden */}
            {!showCalendar && <div className="h-0" />}
          </div>
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
                <div key={e.id} className="bg-white border rounded-xl p-4 flex gap-3 items-start shadow-sm">
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold mt-0.5 ${
                    e.is_clean ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                  }`}>
                    {e.is_clean ? "✓" : "–"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{fmt(e.entry_date)}</p>
                    {e.body
                      ? <p className="text-sm text-gray-700 line-clamp-2">{e.body}</p>
                      : <p className="text-sm text-gray-300 italic">No note</p>
                    }
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
