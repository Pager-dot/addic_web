const BASE = "http://localhost:8000/api";

function getCsrfToken() {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf_token="))
      ?.split("=")[1] ?? ""
  );
}

export const api = {
  async request(method, path, body, _retry = true) {
    const headers = { "Content-Type": "application/json" };
    if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
      headers["X-CSRF-Token"] = getCsrfToken();
    }
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });

    // Auto-refresh access token on 401, then retry once
    if (res.status === 401 && _retry && path !== "/auth/refresh" && path !== "/auth/login") {
      try {
        await api.request("POST", "/auth/refresh", undefined, false);
        return api.request(method, path, body, false);
      } catch {
        throw new Error("Session expired. Please log in again.");
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Request failed");
    }
    return res.json();
  },
  get: (path) => api.request("GET", path),
  post: (path, body) => api.request("POST", path, body),
};
