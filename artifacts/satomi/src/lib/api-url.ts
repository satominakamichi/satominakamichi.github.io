const raw = import.meta.env.VITE_API_URL as string | undefined;

// Strip trailing slash
export const API_BASE = raw ? raw.replace(/\/$/, "") : "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function wsUrl(): string {
  if (raw) {
    const u = new URL(raw);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/satomi-ws`;
  }
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}/satomi-ws`;
}
