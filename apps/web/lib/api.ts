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

// Multipart upload (documents). Lets the browser set the multipart boundary;
// we only attach the bearer token.
async function upload<T>(path: string, form: FormData): Promise<T> {
  const tokens = getTokens();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
    body: form,
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

// Authenticated fetch of a file as a blob for inline preview. Caller is
// responsible for URL.revokeObjectURL(url) when the viewer closes.
async function openInline(path: string): Promise<{ url: string; blob: Blob; type: string }> {
  const tokens = getTokens();
  const res = await fetch(`${BASE}${path}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw await toError(res);
  const blob = await res.blob();
  const type = res.headers.get("content-type") || blob.type || "application/octet-stream";
  return { url: URL.createObjectURL(blob), blob, type };
}

// Authenticated file download → triggers a browser save of the blob.
async function download(path: string, filename: string): Promise<void> {
  const tokens = getTokens();
  const res = await fetch(`${BASE}${path}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw await toError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload,
  download,
  openInline,
};

export const fetcher = <T>(path: string) => api.get<T>(path);
