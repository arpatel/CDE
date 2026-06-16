import { prisma } from "./index.js";

// Database-level guarantees that Prisma's schema DSL can't express
// (partial / expression indexes). Idempotent — safe to run repeatedly, and
// should be re-run after `prisma db push` (which only manages schema-declared
// indexes and may drop these).
//
// Doc Ref must be unique **per folder** among live documents. folder_id is
// nullable (root), and Postgres treats NULLs as distinct, so we COALESCE root
// to a sentinel UUID. Soft-deleted docs and auto-numbered (null) refs are
// excluded via the partial WHERE.
const ROOT_SENTINEL = "00000000-0000-0000-0000-000000000000";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_document_docref_per_folder
    ON documents (
      tenant_id,
      project_id,
      COALESCE(folder_id, '${ROOT_SENTINEL}'::uuid),
      doc_number
    )
    WHERE is_deleted = false AND doc_number IS NOT NULL;
  `);
  console.log("✓ ensured unique index: uq_document_docref_per_folder (Doc Ref unique per folder)");
}

main()
  .catch((e) => {
    console.error("Failed to ensure indexes:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
