import { prisma } from "@cde/db";
import { ApiError } from "./errors.js";
import type { AuthContext } from "../middleware/authenticate.js";

// System-level data-scope enforcement for a single project.
//
// A user's data-access level is set ONCE on their organisation membership (by a
// super admin) — it is NOT assigned per project. From it we derive project
// access:
//   ALL_ORG  → every project in the tenant (super admin / support).
//   OWN_ORG  → every project owned by one of the user's organisations
//              (their org matches the project's org) — plus any project they
//              were explicitly added to. No per-project assignment needed.
//   OWN      → only projects they are an explicit member of.
//
// Out-of-scope projects are reported as 404 so their existence isn't leaked.
export async function assertProjectAccess(auth: AuthContext, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: auth.tenantId, isDeleted: false },
  });
  if (!project) throw ApiError.notFound("Project not found");

  if (auth.dataScope === "ALL_ORG") return project;

  if (
    auth.dataScope === "OWN_ORG" &&
    project.ownerOrgId &&
    auth.organizationIds.includes(project.ownerOrgId)
  ) {
    return project;
  }

  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: auth.userId },
    select: { id: true },
  });
  if (member) return project;

  throw ApiError.notFound("Project not found");
}
