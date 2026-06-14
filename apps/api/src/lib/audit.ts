import { prisma } from "@cde/db";

// Append-only audit trail (spec §1.4, §4). Every create/update/delete should
// call this. Failures are swallowed so auditing never breaks the request path,
// but they are logged for follow-up.
export async function audit(input: {
  tenantId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        changes: (input.changes as object) ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}
