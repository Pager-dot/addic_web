import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import Nav from "../components/Nav";

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
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Nav user={user} />

      {/* Breadcrumb */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2 text-sm">
        <Link to="/" className="text-blue-600 hover:underline">Home</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600 truncate">{club.name}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Club header */}
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{club.name}</h1>
              <p className="text-gray-500 text-sm mt-1">{club.description}</p>
            </div>
            {!isMember && (
              <button
                onClick={joinClub}
                className="w-full sm:w-auto bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 font-medium flex-shrink-0"
              >
                Join Club
              </button>
            )}
          </div>
        </div>

        {/* New post */}
        {isMember && (
          <div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
            >
              + New Post
            </button>
            {showForm && (
              <form onSubmit={createPost} className="bg-white border rounded-xl p-4 mt-3 space-y-3 shadow-sm">
                <input
                  type="text" placeholder="Title" required minLength={3}
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <textarea
                  placeholder="What's on your mind?"
                  required minLength={10} rows={4}
                  value={newPost.body}
                  onChange={(e) => setNewPost({ ...newPost, body: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
                <input
                  type="text" placeholder="Content warning (optional)"
                  value={newPost.content_warning}
                  onChange={(e) => setNewPost({ ...newPost, content_warning: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <button type="submit" className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Post
                </button>
              </form>
            )}
          </div>
        )}

        {/* Posts */}
        <div className="space-y-2">
          {club.posts?.map((post) => (
            <Link
              key={post.id}
              to={`/post/${post.id}`}
              className="block bg-white border rounded-xl p-4 hover:border-blue-200 transition-colors shadow-sm"
            >
              {post.content_warning && (
                <p className="text-xs text-amber-600 mb-1 font-medium">CW: {post.content_warning}</p>
              )}
              <p className="font-medium text-gray-800">{post.title}</p>
              <p className="text-xs text-gray-400 mt-1">
                {post.author} · {new Date(post.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
          {club.posts?.length === 0 && (
            <p className="text-gray-400 text-sm py-4 text-center">No posts yet. Be the first!</p>
          )}
        </div>

      </div>
    </div>
  );
}
