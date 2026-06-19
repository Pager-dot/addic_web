import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import Nav from "../components/Nav";

export default function Home() {
  const [allClubs, setAllClubs] = useState([]);
  const [myClubs, setMyClubs] = useState([]);
  const [user, setUser] = useState(null);
  const [newClub, setNewClub] = useState({ name: "", description: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/auth/me").then(setUser).catch(() => navigate("/login"));
    api.get("/clubs").then(setAllClubs).catch(console.error);
    api.get("/users/me/clubs").then(setMyClubs).catch(console.error);
  }, []);

  async function joinClub(clubId) {
    try {
      await api.post(`/clubs/${clubId}/join`);
      const [all, mine] = await Promise.all([api.get("/clubs"), api.get("/users/me/clubs")]);
      setAllClubs(all);
      setMyClubs(mine);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createClub(e) {
    e.preventDefault();
    try {
      await api.post("/clubs/", newClub);
      setShowCreate(false);
      setNewClub({ name: "", description: "" });
      const [all, mine] = await Promise.all([api.get("/clubs"), api.get("/users/me/clubs")]);
      setAllClubs(all);
      setMyClubs(mine);
    } catch (err) {
      setError(err.message);
    }
  }

  const myClubIds = new Set(myClubs.map((c) => c.id));
  const filtered = search.trim()
    ? allClubs.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : allClubs;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Nav user={user} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* ── All clubs ── */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">All Clubs</h2>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium"
              >
                + New Club
              </button>
            </div>

            <input
              type="text"
              placeholder="Search clubs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            {showCreate && (
              <form onSubmit={createClub} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
                <input
                  type="text" placeholder="Club name" required minLength={3}
                  value={newClub.name}
                  onChange={(e) => setNewClub({ ...newClub, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <textarea
                  placeholder="Description"
                  value={newClub.description}
                  onChange={(e) => setNewClub({ ...newClub, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  rows={2}
                />
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <button type="submit" className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Create
                </button>
              </form>
            )}

            <div className="space-y-2">
              {filtered.map((club) => (
                <div key={club.id} className="bg-white border rounded-xl p-4 flex justify-between items-start shadow-sm hover:border-blue-200 transition-colors">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/club/${club.id}`} className="font-medium text-blue-600 hover:underline">
                        {club.name}
                      </Link>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{club.description}</p>
                  </div>
                  {!myClubIds.has(club.id) && (
                    <button
                      onClick={() => joinClub(club.id)}
                      className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium flex-shrink-0"
                    >
                      Join
                    </button>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-gray-400 text-sm py-4 text-center">
                  {search ? "No clubs match your search." : "No clubs yet. Create one!"}
                </p>
              )}
            </div>
          </div>

          {/* ── My clubs ── */}
          <div>
            <h2 className="font-semibold text-gray-700 mb-3">My Clubs</h2>
            <div className="space-y-2">
              {myClubs.map((club) => (
                <Link
                  key={club.id}
                  to={`/club/${club.id}`}
                  className="block bg-white border rounded-xl p-3 hover:border-blue-300 transition-colors shadow-sm"
                >
                  <p className="text-sm font-medium text-gray-700">{club.name}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{club.role}</p>
                </Link>
              ))}
              {myClubs.length === 0 && (
                <p className="text-gray-400 text-sm">Join a club to see it here.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
