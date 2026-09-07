const API_URL = import.meta.env.VITE_API_URL ?? "";

// Preserves the HTTP status code alongside the message, so callers can tell
// "you're not logged in" (401) apart from a permission error, a rate limit,
// or a transient server hiccup — instead of treating every failure the same.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(payload.error || "Request failed", res.status);
  }

  if (res.headers.get("Content-Type")?.includes("application/json")) {
    return res.json();
  }
  return res.text();
}
