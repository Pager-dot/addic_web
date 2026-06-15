import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import Nav from "../components/Nav";

export default function PostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [user, setUser] = useState(null);
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(setUser).catch(() => navigate("/login"));
    api.get(`/posts/${id}`).then(setPost).catch(console.error);
  }, [id]);

  async function addComment(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/posts/${id}/comments`, { body: commentBody });
      setCommentBody("");
      const updated = await api.get(`/posts/${id}`);
      setPost(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!post) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Nav user={user} />

      {/* Breadcrumb */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2 text-sm">
        <Link to="/" className="text-blue-600 hover:underline">Home</Link>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Post */}
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          {post.content_warning && (
            <p className="text-xs text-amber-600 mb-2 font-medium">Content Warning: {post.content_warning}</p>
          )}
          <h1 className="text-xl font-bold text-gray-800 mb-1">{post.title}</h1>
          <p className="text-xs text-gray-400 mb-4">
            {post.author} · {new Date(post.created_at).toLocaleDateString()}
          </p>
          <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
        </div>

        {/* Comments */}
        <h2 className="font-semibold text-gray-700">Comments ({post.comments?.length || 0})</h2>

        <div className="space-y-2">
          {post.comments?.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-4 shadow-sm">
              <p className="text-sm text-gray-700">{c.body}</p>
              <p className="text-xs text-gray-400 mt-1.5">
                {c.author} · {new Date(c.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
          {post.comments?.length === 0 && (
            <p className="text-gray-400 text-sm py-2 text-center">No comments yet.</p>
          )}
        </div>

        {/* Add comment */}
        {user && (
          <form onSubmit={addComment} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
            <textarea
              placeholder="Add a comment..."
              required minLength={1} rows={3}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit" disabled={submitting}
              className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post Comment"}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
