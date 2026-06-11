const BASE = "http://localhost:8000/api";

export const api = {
  async request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Request failed");
    }
    return res.json();
  },
  get: (path) => api.request("GET", path),
  post: (path, body) => api.request("POST", path, body),
};
