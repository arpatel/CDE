"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setTokens, clearTokens, getTokens, type Tokens } from "./api";

export interface Me {
  id: string;
  email: string;
  displayName: string;
  tenant: { id: string; name: string };
  permissions: string[];
}

export interface Project {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface AppState {
  me: Me | null;
  loading: boolean;
  projects: Project[];
  projectId: string | null;
  setProjectId: (id: string) => void;
  refreshProjects: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (tenantName: string, displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);

  function setProjectId(id: string) {
    setProjectIdState(id);
    if (typeof window !== "undefined") localStorage.setItem("cde_project", id);
  }

  async function loadSession() {
    if (!getTokens()) {
      setLoading(false);
      return;
    }
    try {
      const profile = await api.get<Me>("/auth/me");
      setMe(profile);
      await loadProjects();
    } catch {
      clearTokens();
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    const res = await api.get<{ items: Project[] }>("/projects");
    setProjects(res.items);
    const stored = typeof window !== "undefined" ? localStorage.getItem("cde_project") : null;
    const pick = res.items.find((p) => p.id === stored) ?? res.items[0];
    if (pick) setProjectId(pick.id);
  }

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function afterAuth(tokens: Tokens) {
    setTokens(tokens);
    setLoading(true);
    const profile = await api.get<Me>("/auth/me");
    setMe(profile);
    await loadProjects();
    setLoading(false);
  }

  async function login(email: string, password: string) {
    const tokens = await api.post<Tokens>("/auth/token", { email, password });
    await afterAuth(tokens);
  }

  async function register(tenantName: string, displayName: string, email: string, password: string) {
    const tokens = await api.post<Tokens>("/auth/register", { tenantName, displayName, email, password });
    await afterAuth(tokens);
  }

  function logout() {
    clearTokens();
    setMe(null);
    setProjects([]);
    setProjectIdState(null);
    if (typeof window !== "undefined") localStorage.removeItem("cde_project");
  }

  return (
    <Ctx.Provider
      value={{ me, loading, projects, projectId, setProjectId, refreshProjects: loadProjects, login, register, logout }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
