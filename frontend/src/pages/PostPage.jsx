import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";

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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Home</Link>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border rounded p-6 mb-6">
          {post.content_warning && (
            <p className="text-xs text-amber-600 mb-2 font-medium">Content Warning: {post.content_warning}</p>
          )}
          <h1 className="text-xl font-bold text-gray-800 mb-1">{post.title}</h1>
          <p className="text-xs text-gray-400 mb-4">by @{post.author} · {new Date(post.created_at).toLocaleDateString()}</p>
          <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
        </div>

        <h2 className="font-semibold text-gray-700 mb-3">Comments ({post.comments?.length || 0})</h2>

        <div className="space-y-3 mb-6">
          {post.comments?.map((c) => (
            <div key={c.id} className="bg-white border rounded p-4">
              <p className="text-sm text-gray-700">{c.body}</p>
              <p className="text-xs text-gray-400 mt-1">@{c.author} · {new Date(c.created_at).toLocaleDateString()}</p>
            </div>
          ))}
          {post.comments?.length === 0 && <p className="text-gray-400 text-sm">No comments yet.</p>}
        </div>

        {user && (
          <form onSubmit={addComment} className="bg-white border rounded p-4 space-y-3">
            <textarea
              placeholder="Add a comment..."
              required
              minLength={1}
              rows={3}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post Comment"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
