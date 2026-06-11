import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

export default function Home() {
  const [allClubs, setAllClubs] = useState([]);
  const [myClubs, setMyClubs] = useState([]);
  const [user, setUser] = useState(null);
  const [newClub, setNewClub] = useState({ name: "", description: "", is_private: false });
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/auth/me")
      .then(setUser)
      .catch(() => navigate("/login"));
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
      setNewClub({ name: "", description: "", is_private: false });
      const [all, mine] = await Promise.all([api.get("/clubs"), api.get("/users/me/clubs")]);
      setAllClubs(all);
      setMyClubs(mine);
    } catch (err) {
      setError(err.message);
    }
  }

  async function logout() {
    await api.post("/auth/logout");
    navigate("/login");
  }

  const myClubIds = new Set(myClubs.map((c) => c.id));

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex justify-between items-center">
        <h1 className="font-bold text-lg text-gray-800">Recovery Community</h1>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">@{user.username}</span>
            <button onClick={logout} className="text-sm text-red-500 hover:underline">Logout</button>
          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-700">All Clubs</h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
              + New Club
            </button>
          </div>

          {showCreate && (
            <form onSubmit={createClub} className="bg-white border rounded p-4 mb-4 space-y-3">
              <input
                type="text"
                placeholder="Club name"
                required
                minLength={3}
                value={newClub.name}
                onChange={(e) => setNewClub({ ...newClub, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description"
                value={newClub.description}
                onChange={(e) => setNewClub({ ...newClub, description: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                rows={2}
              />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={newClub.is_private}
                  onChange={(e) => setNewClub({ ...newClub, is_private: e.target.checked })}
                />
                Private club
              </label>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm">Create</button>
            </form>
          )}

          <div className="space-y-3">
            {allClubs.map((club) => (
              <div key={club.id} className="bg-white border rounded p-4 flex justify-between items-start">
                <div>
                  <Link to={`/club/${club.id}`} className="font-medium text-blue-600 hover:underline">
                    {club.name}
                  </Link>
                  {club.is_private && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Private</span>
                  )}
                  <p className="text-sm text-gray-500 mt-1">{club.description}</p>
                </div>
                {!myClubIds.has(club.id) && (
                  <button
                    onClick={() => joinClub(club.id)}
                    className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100 ml-4 shrink-0"
                  >
                    Join
                  </button>
                )}
              </div>
            ))}
            {allClubs.length === 0 && <p className="text-gray-400 text-sm">No clubs yet. Create one!</p>}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-gray-700 mb-4">My Clubs</h2>
          <div className="space-y-2">
            {myClubs.map((club) => (
              <Link
                key={club.id}
                to={`/club/${club.id}`}
                className="block bg-white border rounded p-3 hover:border-blue-300"
              >
                <p className="text-sm font-medium text-gray-700">{club.name}</p>
                <p className="text-xs text-gray-400 capitalize">{club.role}</p>
              </Link>
            ))}
            {myClubs.length === 0 && <p className="text-gray-400 text-sm">Join a club to see it here.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
