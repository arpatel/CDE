import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mirror of the password hashing in apps/api (scrypt). Kept inline so the seed
// has no dependency on the API package.
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

// System permission catalogue (Phase 1 subset). Wildcards supported: "*".
const SYSTEM_ROLES = [
  { name: "Tenant Admin", isSystem: true, permissions: ["*"], dataScope: "ALL_ORG" },
  {
    name: "Project Manager",
    isSystem: true,
    permissions: [
      "project:read",
      "project:create",
      "project:update",
      "project:member:manage",
      "organization:read",
    ],
    dataScope: "OWN_ORG",
  },
  {
    name: "Member",
    isSystem: true,
    permissions: ["project:read", "organization:read"],
    dataScope: "OWN",
  },
];

async function main() {
  console.log("🌱 Seeding CDE foundation data…");

  const tenant = await prisma.tenant.upsert({
    where: { domain: "demo.cde.local" },
    update: {},
    create: {
      name: "Demo Construction Group",
      domain: "demo.cde.local",
      region: "me-central-1",
      planType: "enterprise",
    },
  });

  const roles: Record<string, string> = {};
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: r.name } },
      update: { permissions: r.permissions, dataScope: r.dataScope },
      create: {
        tenantId: tenant.id,
        name: r.name,
        isSystem: r.isSystem,
        permissions: r.permissions,
        dataScope: r.dataScope,
      },
    });
    roles[r.name] = role.id;
  }

  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenant.id,
      name: "Demo Construction Group (Main Contractor)",
      type: "CONTRACTOR",
      country: "AE",
    },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.cde.local" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@demo.cde.local",
      displayName: "Demo Admin",
      passwordHash: hashPassword("Password123!"),
      status: "ACTIVE",
    },
  });

  await prisma.userOrgMembership.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: org.id } },
    update: { roleId: roles["Tenant Admin"]! },
    create: {
      userId: admin.id,
      organizationId: org.id,
      roleId: roles["Tenant Admin"]!,
    },
  });

  console.log("✅ Seed complete.");
  console.log("   Tenant:   Demo Construction Group");
  console.log("   Login:    admin@demo.cde.local / Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
