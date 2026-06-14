"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill, type Field } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";

interface ProjectDetail {
  id: string;
  name: string;
  code: string;
  status: string;
  ownerOrg: { id: string; name: string } | null;
}
interface Member {
  id: string;
  userId: string;
  role: { id: string; name: string } | null;
  user: { id: string; displayName: string; email: string };
}
interface UserLite { id: string; displayName: string; email: string }
interface Role { id: string; name: string }

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showAdd, setShowAdd] = useState(false);
  const [editRole, setEditRole] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: project } = useSWR<ProjectDetail>(id ? `/projects/${id}` : null, fetcher);
  const { data: members, mutate } = useSWR<{ items: Member[] }>(id ? `/projects/${id}/members` : null, fetcher);
  const { data: users } = useSWR<{ items: UserLite[] }>("/users", fetcher);
  const { data: roles } = useSWR<{ items: Role[] }>("/roles", fetcher);

  const memberItems = members?.items ?? [];
  const memberIds = new Set(memberItems.map((m) => m.userId));
  const availableUsers = (users?.items ?? []).filter((u) => !memberIds.has(u.id));
  const roleOptions = (roles?.items ?? []).map((r) => ({ value: r.id, label: r.name }));

  const addFields: Field[] = [
    { name: "userId", label: "User", type: "select", required: true, options: availableUsers.map((u) => ({ value: u.id, label: `${u.displayName} (${u.email})` })) },
    { name: "roleId", label: "Project role", type: "select", required: true, options: roleOptions },
  ];

  async function addMember(v: Record<string, string>) {
    await api.post(`/projects/${id}/members`, { userId: v.userId, roleId: v.roleId });
    await mutate();
  }

  async function changeRole(v: Record<string, string>) {
    await api.patch(`/projects/${id}/members/${editRole!.userId}`, { roleId: v.roleId });
    await mutate();
  }

  async function remove(m: Member) {
    setBusy(m.id);
    try {
      await api.del(`/projects/${id}/members/${m.userId}`);
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell>
      <div className="breadcrumb" style={{ marginBottom: -8 }}>
        <Link href="/projects">Projects</Link> <span>/</span> {project?.name ?? "…"}
      </div>
      <PageHeader
        title={project?.name ?? "Project"}
        subtitle={project ? `${project.code} · ${project.ownerOrg?.name ?? "no org"} · ${project.status}` : ""}
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} disabled={availableUsers.length === 0} title={availableUsers.length ? "" : "All users already assigned"}>
            + Assign User
          </button>
        }
      />

      <div className="table-card">
        <div className="table-toolbar"><span className="table-title">{memberItems.length} member(s)</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Project Role</th><th></th></tr></thead>
            <tbody>
              {memberItems.length === 0 ? (
                <tr><td colSpan={4}><div className="empty">No users assigned yet — click “Assign User”.</div></td></tr>
              ) : memberItems.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.user.displayName}</td>
                  <td style={{ color: "#64748b" }}>{m.user.email}</td>
                  <td>{m.role ? <span className="status-pill status-open">{m.role.name}</span> : <span className="muted">— none —</span>}</td>
                  <td>
                    <div className="flex-gap">
                      <button className="action-link" onClick={() => setEditRole(m)}>Change role</button>
                      <button className="action-link" style={{ color: "#dc2626" }} disabled={busy === m.id} onClick={() => remove(m)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <Modal title="Assign User to Project" submitLabel="Assign" fields={addFields} onClose={() => setShowAdd(false)} onSubmit={addMember} />
      )}

      {editRole && (
        <Modal
          title={`Change role — ${editRole.user.displayName}`}
          submitLabel="Save role"
          fields={[{ name: "roleId", label: "Project role", type: "select", required: true, options: roleOptions }]}
          initialValues={{ roleId: editRole.role?.id ?? "" }}
          onClose={() => setEditRole(null)}
          onSubmit={changeRole}
        />
      )}
    </Shell>
  );
}
