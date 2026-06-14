"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login, register } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ tenantName: "", displayName: "", email: "", password: "" });

  function upd(k: keyof typeof f) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(f.email, f.password);
      else await register(f.tenantName, f.displayName, f.email, f.password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">▲ CDE Platform</div>
        <div className="auth-sub">Common Data Environment for Construction</div>

        <div className="auth-tabs">
          <div className={`auth-tab${mode === "login" ? " active" : ""}`} onClick={() => setMode("login")}>Sign in</div>
          <div className={`auth-tab${mode === "register" ? " active" : ""}`} onClick={() => setMode("register")}>Create tenant</div>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <div className="field">
                <label>Company / Tenant name *</label>
                <input required value={f.tenantName} onChange={upd("tenantName")} placeholder="Acme Builders" />
              </div>
              <div className="field">
                <label>Your name *</label>
                <input required value={f.displayName} onChange={upd("displayName")} placeholder="Alice Admin" />
              </div>
            </>
          )}
          <div className="field">
            <label>Email *</label>
            <input type="email" required value={f.email} onChange={upd("email")} placeholder="you@company.com" />
          </div>
          <div className="field">
            <label>Password *</label>
            <input type="password" required value={f.password} onChange={upd("password")} placeholder="••••••••" />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%", marginTop: 8 }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create tenant & sign in"}
          </button>
        </form>

        {mode === "login" && (
          <div className="muted" style={{ textAlign: "center", marginTop: 16 }}>
            Demo: admin@demo.cde.local / Password123!
          </div>
        )}
      </div>
    </div>
  );
}
