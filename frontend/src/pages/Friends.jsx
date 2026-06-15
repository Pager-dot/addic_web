import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Nav from "../components/Nav";

function fmt(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric",
  });
}

export default function Friends() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("connected");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState([]);
  const [connections, setConnections] = useState([]);
  const [feed, setFeed] = useState([]);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then(setUser).catch(() => navigate("/login"));
    loadConnections();
  }, []);

  async function loadConnections() {
    try {
      const [conn, pend, feedData] = await Promise.all([
        api.get("/connections/"),
        api.get("/connections/pending"),
        api.get("/journal/feed"),
      ]);
      setConnections(conn);
      setPending(pend);
      setFeed(feedData);
    } catch (err) {
      setError(err.message);
    }
  }

  async function search(e) {
    e.preventDefault();
    // Strip leading @ so typing "username" and "@username" both work
    const cleaned = query.replace(/^@+/, "").trim();
    if (cleaned.length < 2) {
      setError("Enter at least 2 characters to search");
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setError(null);
    try {
      const results = await api.get(`/connections/search?q=${encodeURIComponent(cleaned)}`);
      setSearchResults(results);
      if (results.length === 0) setError("No users found. Check the spelling and try again.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function flash(msg) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 2500);
  }

  async function sendRequest(addresseeId, username) {
    try {
      await api.post("/connections/request", { addressee_id: addresseeId });
      setSearchResults((r) => r.filter((u) => u.id !== addresseeId));
      flash(`Request sent to ${username}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function acceptRequest(connectionId) {
    try {
      await api.post(`/connections/${connectionId}/accept`);
      await loadConnections();
      flash("Connection accepted!");
    } catch (err) {
      setError(err.message);
    }
  }

  async function rejectRequest(connectionId) {
    try {
      await api.post(`/connections/${connectionId}/reject`);
      setPending((p) => p.filter((r) => r.id !== connectionId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeConnection(connectionId) {
    try {
      await api.post(`/connections/${connectionId}/reject`);
      await loadConnections();
    } catch (err) {
      setError(err.message);
    }
  }

  const TABS = [
    { key: "connected", label: `Connected${connections.length ? ` (${connections.length})` : ""}` },
    { key: "requests", label: `Requests${pending.length ? ` (${pending.length})` : ""}` },
    { key: "search", label: "Find people" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Nav user={user} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-bold text-gray-800">Friends</h1>

        {actionMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
            {actionMsg}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline text-xs ml-2">dismiss</button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b bg-white rounded-t-lg overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError(null); setSearchResults([]); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Search tab ── */}
        {tab === "search" && (
          <div className="space-y-3">
            <form onSubmit={search} className="flex gap-2">
              <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-400">
                <span className="pl-3 text-gray-400 text-sm select-none">@</span>
                <input
                  type="text"
                  placeholder="username"
                  value={query.replace(/^@+/, "")}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 px-2 py-2 text-sm focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {searching ? "..." : "Search"}
              </button>
            </form>
            <p className="text-xs text-gray-400">Enter a username to find someone you know</p>

            <div className="space-y-2">
              {searchResults.map((u) => (
                <div key={u.id} className="bg-white border rounded-xl p-4 flex justify-between items-center shadow-sm">
                  <span className="text-sm font-medium text-gray-700">{u.username}</span>
                  {u.status === "connected" && (
                    <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded-lg font-medium">
                      Connected
                    </span>
                  )}
                  {u.status === "pending_sent" && (
                    <span className="text-xs bg-gray-50 text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg font-medium">
                      Request sent
                    </span>
                  )}
                  {u.status === "pending_received" && (
                    <button
                      onClick={() => acceptRequest(u.connection_id)}
                      className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium"
                    >
                      Accept
                    </button>
                  )}
                  {!u.status && (
                    <button
                      onClick={() => sendRequest(u.id, u.username)}
                      className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Requests tab ── */}
        {tab === "requests" && (
          <div className="space-y-2">
            {pending.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No pending requests.</p>
            )}
            {pending.map((r) => (
              <div key={r.id} className="bg-white border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-gray-700">{r.requester_username}</p>
                  <p className="text-xs text-gray-400">Sent {new Date(r.sent_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptRequest(r.id)}
                    className="flex-1 sm:flex-none text-xs bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-lg hover:bg-green-100 font-medium"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => rejectRequest(r.id)}
                    className="flex-1 sm:flex-none text-xs bg-gray-50 text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-100 font-medium"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Connected tab ── */}
        {tab === "connected" && (
          <div className="space-y-4">
            {connections.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No connections yet.{" "}
                <button onClick={() => setTab("search")} className="text-blue-500 underline">
                  Find people
                </button>
              </p>
            )}

            {connections.length > 0 && (
              <div className="space-y-2">
                {connections.map((c) => (
                  <div key={c.id} className="bg-white border rounded-xl p-4 flex justify-between items-center shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{c.friend_username}</p>
                      <p className="text-xs text-gray-400">Since {new Date(c.connected_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => removeConnection(c.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {feed.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Their entries</h2>
                <div className="space-y-3">
                  {feed.map((e) => (
                    <div key={e.id} className="bg-white border rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              e.is_clean ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {e.is_clean ? "✓" : "–"}
                          </span>
                          <span className="text-sm font-medium text-gray-700">{e.author_username}</span>
                        </div>
                        <span className="text-xs text-gray-400">{fmt(e.entry_date)}</span>
                      </div>
                      {e.body ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{e.body}</p>
                      ) : (
                        <p className="text-sm text-gray-300 italic">No note</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
