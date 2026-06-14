"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useApp } from "@/lib/store";

const NAV = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", icon: "🏠", label: "Dashboard" },
      { href: "/documents", icon: "📄", label: "Documents" },
      { href: "/drawings", icon: "📐", label: "Drawings" },
    ],
  },
  {
    label: "Workflows",
    items: [
      { href: "/workflows", icon: "🔄", label: "Workflows" },
      { href: "/rfis", icon: "❓", label: "RFI" },
      { href: "/submittals", icon: "📋", label: "Submittals" },
    ],
  },
  {
    label: "Field",
    items: [
      { href: "/snags", icon: "📍", label: "Snagging" },
      { href: "/ncrs", icon: "✅", label: "Quality (NCR)" },
      { href: "/hse", icon: "🦺", label: "HSE" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/organizations", icon: "🏢", label: "Organizations" },
      { href: "/users", icon: "👥", label: "Users" },
      { href: "/roles", icon: "🔑", label: "Roles" },
      { href: "/projects", icon: "📁", label: "Projects" },
    ],
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const { me, loading, projects, projectId, setProjectId, logout } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (loading) return <div className="center-msg">Loading…</div>;
  if (!me) return <div className="center-msg">Redirecting to sign in…</div>;

  const initials = me.displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div className="topbar">
        <div className="topbar-logo">▲ CDE Platform</div>
        <div className="topbar-project">
          {projects.length > 0 && (
            <select
              className="project-select"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name} ({p.code})
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="topbar-actions">
          <span className="muted" style={{ color: "rgba(255,255,255,.7)" }}>{me.tenant.name}</span>
          <div className="avatar" title={me.displayName}>{initials}</div>
          <button className="logout-btn" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="layout">
        <nav className="sidebar">
          {NAV.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <div className="sidebar-label">{section.label}</div>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`}>
                    <span className="nav-icon">{item.icon}</span> {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <main className="main">
          <div className="page">{children}</div>
        </main>
      </div>
    </>
  );
}
