const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/v1";
const TOKEN_KEY = "cde_tokens";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export function getTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

export function setTokens(t: Tokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function toError(res: Response): Promise<ApiError> {
  let code = "ERROR";
  let detail = res.statusText;
  try {
    const body = await res.json();
    code = body.code ?? code;
    detail = body.detail ?? body.title ?? detail;
  } catch {
    /* non-JSON */
  }
  return new ApiError(res.status, code, detail);
}

async function request<T>(path: string, opts: RequestInit = {}, allowRetry = true): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && allowRetry && tokens?.refreshToken) {
    const r = await fetch(`${BASE}/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (r.ok) {
      setTokens(await r.json());
      return request<T>(path, opts, false);
    }
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export const fetcher = <T>(path: string) => api.get<T>(path);
