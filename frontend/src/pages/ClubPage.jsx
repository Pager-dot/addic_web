import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function ClubPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [user, setUser] = useState(null);
  const [myClubs, setMyClubs] = useState([]);
  const [newPost, setNewPost] = useState({ title: "", body: "", content_warning: "" });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then(setUser).catch(() => navigate("/login"));
    api.get(`/clubs/${id}`).then(setClub).catch(console.error);
    api.get("/users/me/clubs").then(setMyClubs).catch(console.error);
  }, [id]);

  const isMember = myClubs.some((c) => c.id === id);

  async function joinClub() {
    try {
      await api.post(`/clubs/${id}/join`);
      const mine = await api.get("/users/me/clubs");
      setMyClubs(mine);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createPost(e) {
    e.preventDefault();
    try {
      const post = await api.post("/posts/", { club_id: id, ...newPost });
      navigate(`/post/${post.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!club) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Home</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">{club.name}</span>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border rounded p-5 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{club.name}</h1>
              <p className="text-gray-500 text-sm mt-1">{club.description}</p>
            </div>
            {!isMember && (
              <button
                onClick={joinClub}
                className="bg-green-600 text-white text-sm px-3 py-1.5 rounded hover:bg-green-700"
              >
                Join Club
              </button>
            )}
          </div>
        </div>

        {isMember && (
          <div className="mb-6">
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
            >
              + New Post
            </button>
            {showForm && (
              <form onSubmit={createPost} className="bg-white border rounded p-4 mt-3 space-y-3">
                <input
                  type="text"
                  placeholder="Title"
                  required
                  minLength={3}
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <textarea
                  placeholder="What's on your mind?"
                  required
                  minLength={10}
                  rows={4}
                  value={newPost.body}
                  onChange={(e) => setNewPost({ ...newPost, body: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Content warning (optional)"
                  value={newPost.content_warning}
                  onChange={(e) => setNewPost({ ...newPost, content_warning: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm">Post</button>
              </form>
            )}
          </div>
        )}

        <div className="space-y-3">
          {club.posts?.map((post) => (
            <Link key={post.id} to={`/post/${post.id}`} className="block bg-white border rounded p-4 hover:border-blue-300">
              {post.content_warning && (
                <p className="text-xs text-amber-600 mb-1">CW: {post.content_warning}</p>
              )}
              <p className="font-medium text-gray-800">{post.title}</p>
              <p className="text-xs text-gray-400 mt-1">by @{post.author} · {new Date(post.created_at).toLocaleDateString()}</p>
            </Link>
          ))}
          {club.posts?.length === 0 && <p className="text-gray-400 text-sm">No posts yet. Be the first!</p>}
        </div>
      </div>
    </div>
  );
}
