const API_URL = import.meta.env.VITE_API_URL ?? "";

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
    throw new Error(payload.error || "Request failed");
  }

  if (res.headers.get("Content-Type")?.includes("application/json")) {
    return res.json();
  }
  return res.text();
}
