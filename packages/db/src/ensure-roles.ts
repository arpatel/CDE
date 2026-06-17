import { prisma } from "./index.js";

// Org-level access tiers (assigned on the Users screen via checkboxes). Functional
// roles (Document Controller, QS, custom…) are level="project" and assigned per
// project. Idempotent — safe to re-run; run after schema changes / new tenants.
const ORG_TIERS = [
  {
    name: "Tenant Admin", // Super Admin
    dataScope: "ALL_ORG",
    permissions: ["*"],
  },
  {
    name: "Organization Admin",
    dataScope: "OWN_ORG",
    permissions: [
      "user:read", "user:manage", "role:read",
      "project:read", "project:create", "project:update", "project:member:manage",
      "organization:read",
      "document:read", "document:create", "document:update",
      "drawing:read", "drawing:create", "drawing:update",
      "attribute:read", "attribute:create", "attribute:update",
      "rfi:read", "submittal:read", "workflow:read", "task:read",
    ],
  },
  {
    name: "Organization Member",
    dataScope: "OWN_ORG",
    permissions: ["project:read", "organization:read", "document:read", "drawing:read", "rfi:read", "task:read", "attribute:read"],
  },
];
const TIER_NAMES = new Set(ORG_TIERS.map((t) => t.name));

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    for (const tier of ORG_TIERS) {
      await prisma.role.upsert({
        where: { tenantId_name: { tenantId: t.id, name: tier.name } },
        update: { level: "org", isSystem: true, dataScope: tier.dataScope, permissions: tier.permissions },
        create: { tenantId: t.id, name: tier.name, isSystem: true, level: "org", dataScope: tier.dataScope, permissions: tier.permissions },
      });
    }
    // Every other role becomes a project-level functional role.
    await prisma.role.updateMany({
      where: { tenantId: t.id, name: { notIn: [...TIER_NAMES] } },
      data: { level: "project" },
    });
  }
  console.log(`✓ ensured org access tiers (${ORG_TIERS.map((t) => t.name).join(", ")}) across ${tenants.length} tenant(s)`);
}

main()
  .catch((e) => { console.error("Failed to ensure roles:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
