import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, openClubWs } from "../api";
import Nav from "../components/Nav";

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function shouldGroup(prev, curr) {
  if (!prev || prev.author_id !== curr.author_id) return false;
  return new Date(curr.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
}

export default function ClubPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [club, setClub] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);
  const [wsState, setWsState] = useState("disconnected"); // "connecting"|"open"|"closed"|"disconnected"
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const nearBottomRef = useRef(true);

  // Track if user is near bottom so we auto-scroll only when appropriate
  function onScroll() {
    const el = messagesRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Load club info + initial messages
  useEffect(() => {
    api.get("/auth/me").then(setUser).catch(() => navigate("/login"));

    api.get(`/clubs/${id}`).then((data) => {
      setClub(data);
      setMessages(data.messages || []);
      setHasMore((data.messages || []).length === 50);
    }).catch(() => setError("Club not found."));
  }, [id]);

  // Open WebSocket once we know user is a member
  useEffect(() => {
    if (!club?.is_member || !user) return;

    let ws;
    let dead = false;

    async function connect() {
      try {
        const { ticket } = await api.post("/auth/ws-ticket");
        if (dead) return;
        setWsState("connecting");
        ws = openClubWs(
          id,
          ticket,
          (msg) => {
            setMessages((prev) => [...prev, msg]);
            if (nearBottomRef.current) {
              // slight delay so DOM updates first
              setTimeout(scrollToBottom, 30);
            }
          },
          () => {
            setWsState("closed");
          },
        );
        ws.onopen = () => setWsState("open");
        wsRef.current = ws;
      } catch {
        setWsState("closed");
      }
    }

    connect();
    // Scroll to bottom on initial load
    setTimeout(scrollToBottom, 100);

    return () => {
      dead = true;
      ws?.close();
      wsRef.current = null;
    };
  }, [club?.is_member, user, id]);

  // Auto-scroll when messages arrive and user is near bottom
  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom();
  }, [messages.length]);

  async function loadEarlier() {
    if (!messages.length) return;
    setLoadingEarlier(true);
    const oldestId = messages[0].id;
    try {
      const older = await api.get(`/clubs/${id}/messages?before=${oldestId}`);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === 50);
      // Restore scroll position: after prepend, scroll so old first message stays visible
      const el = messagesRef.current;
      if (el) {
        const oldHeight = el.scrollHeight;
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - oldHeight;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingEarlier(false);
    }
  }

  function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(text);
    setInput("");
  }

  async function joinClub() {
    try {
      await api.post(`/clubs/${id}/join`);
      const data = await api.get(`/clubs/${id}`);
      setClub(data);
      setMessages(data.messages || []);
      setHasMore((data.messages || []).length === 50);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteClub() {
    try {
      await api.delete(`/clubs/${id}`);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
        <Nav user={user} />
        <div className="p-8 text-gray-400 text-center">{error || "Loading..."}</div>
      </div>
    );
  }

  const myUserId = user?.id;

  // ── Non-member view ───────────────────────────────────────────────────────

  if (!club.is_member) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
        <Nav user={user} />
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2 text-sm">
          <Link to="/" className="text-blue-600 hover:underline">Home</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600 truncate">{club.name}</span>
        </div>
        <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800">{club.name}</h1>
            {club.description && <p className="text-gray-500 text-sm mt-1">{club.description}</p>}
            <p className="text-xs text-gray-400 mt-2">{club.member_count} member{club.member_count !== 1 ? "s" : ""}</p>
          </div>
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center space-y-3">
            <div className="text-3xl">🔒</div>
            <p className="text-gray-600 font-medium">Join to see the group chat</p>
            <p className="text-gray-400 text-sm">This is a private space for members.</p>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={joinClub}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Join Club
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Member chat view ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-50 pb-16 md:pb-0">
      <Nav user={user} />

      {/* Chat header */}
      <div className="bg-white border-b px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-blue-600 hover:underline text-sm flex-shrink-0">← Home</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700 truncate">{club.name}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{club.member_count} members</span>
        </div>
        {club.is_moderator && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-2"
            title="Delete club"
          >
            Delete club
          </button>
        )}
      </div>

      {/* WS status banner */}
      {wsState === "closed" && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-700 text-xs px-4 py-1.5 text-center flex-shrink-0">
          Connection lost — reload to reconnect
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5"
      >
        {hasMore && (
          <div className="text-center py-2">
            <button
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="text-xs text-blue-500 hover:underline disabled:opacity-50"
            >
              {loadingEarlier ? "Loading..." : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">
            No messages yet. Say hello!
          </p>
        )}

        {messages.map((msg, i) => {
          const isOwn = msg.author_id === myUserId;
          const grouped = shouldGroup(messages[i - 1], msg);

          return (
            <div key={msg.id} className={`flex flex-col ${isOwn ? "items-end" : "items-start"} ${grouped ? "mt-0.5" : "mt-3"}`}>
              {!grouped && (
                <div className={`flex items-baseline gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                  <span className="text-xs font-semibold text-gray-600">{msg.author}</span>
                  <span className="text-xs text-gray-400">{fmtTime(msg.created_at)}</span>
                </div>
              )}
              <div
                className={`max-w-xs sm:max-w-md lg:max-w-lg px-3 py-2 rounded-2xl text-sm break-words ${
                  isOwn
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
                }`}
              >
                {msg.body}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Input bar */}
      <form
        onSubmit={send}
        className="bg-white border-t px-3 py-2 flex gap-2 items-end flex-shrink-0"
      >
        <textarea
          rows={1}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); }
          }}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none overflow-hidden"
          style={{ minHeight: "38px" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || wsState !== "open"}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex-shrink-0 h-[38px]"
        >
          Send
        </button>
      </form>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h2 className="font-bold text-gray-800">Delete {club.name}?</h2>
            <p className="text-sm text-gray-500">This will permanently delete the club and all its messages. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteClub}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
