import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@cde/db";
import { registerCrud } from "../../lib/crud.js";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";
import { DOMAIN_MODULES } from "./schemas.js";

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  // Every domain route requires a valid token (tenant context).
  app.addHook("preHandler", authenticate);

  // 1. Generic CRUD for all domain modules.
  for (const cfg of DOMAIN_MODULES) registerCrud(app, cfg);

  // 2. Lifecycle endpoints layered on top.
  registerRfiLifecycle(app);
  registerDocumentLifecycle(app);
  registerSubmittalLifecycle(app);
  registerPermitLifecycle(app);
  registerWorkflow(app);
  registerMeAndNotifications(app);
}

async function assertProject(tenantId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, tenantId, isDeleted: false } });
  if (!p) throw ApiError.notFound("Project not found");
}

// ─── RFI lifecycle (§2.4) ────────────────────────────────────────────────────
function registerRfiLifecycle(app: FastifyInstance) {
  const RespondSchema = z.object({
    body: z.string().min(1),
    responseType: z.enum(["response", "clarification", "close"]).default("response"),
  });

  app.post(
    "/projects/:projectId/rfis/:id/respond",
    { preHandler: requirePermission("rfi:update") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const rfi = await prisma.rfi.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!rfi) throw ApiError.notFound();
      const body = parse(RespondSchema, req.body);

      const response = await prisma.rfiResponse.create({
        data: { rfiId: id, authorId: userId, body: body.body, responseType: body.responseType },
      });
      const nextStatus = body.responseType === "close" ? "closed" : "pending_response";
      await prisma.rfi.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(body.responseType === "close" ? { closedAt: new Date() } : {}),
        },
      });
      await audit({ tenantId, userId, action: "rfi.responded", resourceType: "rfi", resourceId: id, ip: req.ip });
      return reply.code(201).send(response);
    },
  );

  for (const action of ["close", "void"] as const) {
    app.post(
      `/projects/:projectId/rfis/:id/${action}`,
      { preHandler: requirePermission("rfi:update") },
      async (req) => {
        const { tenantId, userId } = ctx(req);
        const { projectId, id } = req.params as { projectId: string; id: string };
        const rfi = await prisma.rfi.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
        if (!rfi) throw ApiError.notFound();
        const updated = await prisma.rfi.update({
          where: { id },
          data: { status: action === "close" ? "closed" : "void", closedAt: new Date() },
        });
        await audit({ tenantId, userId, action: `rfi.${action}`, resourceType: "rfi", resourceId: id, ip: req.ip });
        return updated;
      },
    );
  }
}

// ─── Document lifecycle (§2.1) ───────────────────────────────────────────────
function registerDocumentLifecycle(app: FastifyInstance) {
  // Presigned-upload pattern. Local stub returns a fileKey + a dev upload URL;
  // the S3 adapter slots in behind this same contract.
  const UploadUrlSchema = z.object({ filename: z.string().min(1), mimeType: z.string().optional() });
  app.post(
    "/projects/:projectId/documents/upload-url",
    { preHandler: requirePermission("document:create") },
    async (req) => {
      const { tenantId } = ctx(req);
      const { projectId } = req.params as { projectId: string };
      await assertProject(tenantId, projectId);
      const body = parse(UploadUrlSchema, req.body);
      const fileKey = `${tenantId}/${projectId}/${randomUUID()}/${body.filename}`;
      return {
        fileKey,
        uploadUrl: `http://localhost:4000/v1/_dev/upload/${encodeURIComponent(fileKey)}`,
        method: "PUT",
        expiresIn: 900,
      };
    },
  );

  const RevisionSchema = z.object({
    fileKey: z.string().min(1),
    fileSize: z.number().int().min(0).optional(),
    mimeType: z.string().optional(),
    revisionLabel: z.string().optional(),
  });
  app.post(
    "/projects/:projectId/documents/:id/revisions",
    { preHandler: requirePermission("document:update") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!doc) throw ApiError.notFound();
      const body = parse(RevisionSchema, req.body);
      const count = await prisma.documentRevision.count({ where: { documentId: id } });
      const revisionNumber = count + 1;
      const revision = await prisma.documentRevision.create({
        data: {
          documentId: id,
          revisionNumber,
          revisionLabel: body.revisionLabel ?? `Rev ${revisionNumber}`,
          fileKey: body.fileKey,
          fileSize: BigInt(body.fileSize ?? 0),
          mimeType: body.mimeType ?? null,
          uploaderId: userId,
        },
      });
      await prisma.document.update({
        where: { id },
        data: { currentRevisionId: revision.id, status: "uploaded", version: { increment: 1 } },
      });
      await audit({ tenantId, userId, action: "document.revision.added", resourceType: "document", resourceId: id, ip: req.ip });
      // BigInt isn't JSON-serialisable — return a safe shape.
      return reply.code(201).send({ ...revision, fileSize: Number(revision.fileSize) });
    },
  );

  app.post(
    "/projects/:projectId/documents/:id/checkout",
    { preHandler: requirePermission("document:update") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!doc) throw ApiError.notFound();
      if (doc.lockedBy && doc.lockedBy !== userId) {
        throw ApiError.unprocessable("Document is checked out by another user");
      }
      const updated = await prisma.document.update({
        where: { id },
        data: { lockedBy: userId, lockedAt: new Date() },
      });
      await audit({ tenantId, userId, action: "document.checked_out", resourceType: "document", resourceId: id, ip: req.ip });
      return updated;
    },
  );

  app.post(
    "/projects/:projectId/documents/:id/checkin",
    { preHandler: requirePermission("document:update") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!doc) throw ApiError.notFound();
      if (doc.lockedBy && doc.lockedBy !== userId) {
        throw ApiError.forbidden("Only the lock owner can check in this document");
      }
      const updated = await prisma.document.update({
        where: { id },
        data: { lockedBy: null, lockedAt: null },
      });
      await audit({ tenantId, userId, action: "document.checked_in", resourceType: "document", resourceId: id, ip: req.ip });
      return updated;
    },
  );
}

// ─── Submittal lifecycle (§2.5) ──────────────────────────────────────────────
function registerSubmittalLifecycle(app: FastifyInstance) {
  app.post(
    "/projects/:projectId/submittals/:id/revisions",
    { preHandler: requirePermission("submittal:update") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const sub = await prisma.submittal.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!sub) throw ApiError.notFound();
      const body = parse(z.object({ notes: z.string().optional() }), req.body);
      const count = await prisma.submittalRevision.count({ where: { submittalId: id } });
      const rev = await prisma.submittalRevision.create({
        data: { submittalId: id, revisionNumber: count + 1, submittedBy: userId, notes: body.notes ?? null },
      });
      await prisma.submittal.update({ where: { id }, data: { status: "under_review" } });
      return reply.code(201).send(rev);
    },
  );

  const ReviewSchema = z.object({
    revisionId: z.string().uuid(),
    action: z.enum(["approved", "approved_as_noted", "revise", "rejected"]),
    comment: z.string().optional(),
  });
  app.post(
    "/projects/:projectId/submittals/:id/review",
    { preHandler: requirePermission("submittal:update") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const sub = await prisma.submittal.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!sub) throw ApiError.notFound();
      const body = parse(ReviewSchema, req.body);
      const rev = await prisma.submittalRevision.findFirst({ where: { id: body.revisionId, submittalId: id } });
      if (!rev) throw ApiError.unprocessable("Revision does not belong to this submittal");
      const review = await prisma.submittalReview.create({
        data: { submittalRevisionId: body.revisionId, reviewerId: userId, action: body.action, comment: body.comment ?? null },
      });
      const statusMap: Record<string, string> = {
        approved: "approved",
        approved_as_noted: "approved_as_noted",
        revise: "revise_resubmit",
        rejected: "rejected",
      };
      await prisma.submittal.update({ where: { id }, data: { status: statusMap[body.action]! } });
      await audit({ tenantId, userId, action: "submittal.reviewed", resourceType: "submittal", resourceId: id, changes: { action: body.action }, ip: req.ip });
      return reply.code(201).send(review);
    },
  );
}

// ─── Permit approval (§2.10) ─────────────────────────────────────────────────
function registerPermitLifecycle(app: FastifyInstance) {
  app.post(
    "/projects/:projectId/permits/:id/approve",
    { preHandler: requirePermission("permit:update") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const permit = await prisma.permit.findFirst({ where: { id, tenantId, projectId } });
      if (!permit) throw ApiError.notFound();
      const updated = await prisma.permit.update({
        where: { id },
        data: { status: "approved", approvedBy: userId },
      });
      await audit({ tenantId, userId, action: "permit.approved", resourceType: "permit", resourceId: id, ip: req.ip });
      return updated;
    },
  );
}

// ─── Workflow engine (§2.3) ──────────────────────────────────────────────────
function registerWorkflow(app: FastifyInstance) {
  const StepSchema = z.object({
    stepNumber: z.number().int().min(1),
    stepType: z.enum(["approval", "review", "acknowledgement", "notification"]).default("approval"),
    assigneeType: z.enum(["user", "group", "role"]).default("user"),
    assigneeId: z.string().uuid().optional(),
    slaHours: z.number().int().min(0).optional(),
    dueDate: z.coerce.date().optional(),
  });
  const StartSchema = z.object({
    name: z.string().min(1).max(160),
    templateId: z.string().uuid().optional(),
    resourceType: z.string().min(1),
    resourceId: z.string().uuid().optional(),
    steps: z.array(StepSchema).min(1),
  });

  app.post(
    "/projects/:projectId/workflows",
    { preHandler: requirePermission("workflow:manage") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId } = req.params as { projectId: string };
      await assertProject(tenantId, projectId);
      const body = parse(StartSchema, req.body);
      const ordered = [...body.steps].sort((a, b) => a.stepNumber - b.stepNumber);

      const instance = await prisma.workflowInstance.create({
        data: {
          tenantId,
          projectId,
          templateId: body.templateId ?? null,
          name: body.name,
          resourceType: body.resourceType,
          resourceId: body.resourceId ?? null,
          createdBy: userId,
          steps: {
            create: ordered.map((s, idx) => ({
              stepNumber: s.stepNumber,
              stepType: s.stepType,
              assigneeType: s.assigneeType,
              assigneeId: s.assigneeId ?? null,
              slaHours: s.slaHours ?? null,
              dueDate: s.dueDate ?? null,
              status: idx === 0 ? "active" : "pending",
            })),
          },
        },
        include: { steps: { orderBy: { stepNumber: "asc" } } },
      });
      await audit({ tenantId, userId, action: "workflow.started", resourceType: "workflow", resourceId: instance.id, ip: req.ip });
      return reply.code(201).send(instance);
    },
  );

  app.get(
    "/projects/:projectId/workflows/:id",
    { preHandler: requirePermission("workflow:read") },
    async (req) => {
      const { tenantId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const instance = await prisma.workflowInstance.findFirst({
        where: { id, tenantId, projectId },
        include: { steps: { orderBy: { stepNumber: "asc" } } },
      });
      if (!instance) throw ApiError.notFound();
      return instance;
    },
  );

  for (const decision of ["approve", "reject"] as const) {
    app.post(
      `/projects/:projectId/workflows/:id/steps/:stepId/${decision}`,
      { preHandler: requirePermission("workflow:action") },
      async (req) => {
        const { tenantId, userId } = ctx(req);
        const { projectId, id, stepId } = req.params as { projectId: string; id: string; stepId: string };
        const body = parse(z.object({ comment: z.string().optional() }), req.body ?? {});

        const instance = await prisma.workflowInstance.findFirst({ where: { id, tenantId, projectId } });
        if (!instance) throw ApiError.notFound();
        const step = await prisma.workflowStep.findFirst({ where: { id: stepId, instanceId: id } });
        if (!step) throw ApiError.notFound("Step not found");
        if (step.status !== "active") throw ApiError.unprocessable("Step is not awaiting action");

        await prisma.workflowStep.update({
          where: { id: stepId },
          data: { status: decision === "approve" ? "approved" : "rejected", actionedAt: new Date(), actionedBy: userId, comment: body.comment ?? null },
        });

        if (decision === "reject") {
          await prisma.workflowInstance.update({ where: { id }, data: { status: "rejected", completedAt: new Date() } });
        } else {
          const next = await prisma.workflowStep.findFirst({
            where: { instanceId: id, status: "pending" },
            orderBy: { stepNumber: "asc" },
          });
          if (next) {
            await prisma.workflowStep.update({ where: { id: next.id }, data: { status: "active" } });
          } else {
            await prisma.workflowInstance.update({ where: { id }, data: { status: "completed", completedAt: new Date() } });
          }
        }
        await audit({ tenantId, userId, action: `workflow.${decision}`, resourceType: "workflow", resourceId: id, ip: req.ip });
        return prisma.workflowInstance.findFirst({ where: { id }, include: { steps: { orderBy: { stepNumber: "asc" } } } });
      },
    );
  }
}

// ─── /me — cross-project caller views ────────────────────────────────────────
function registerMeAndNotifications(app: FastifyInstance) {
  app.get("/me/pending-approvals", async (req) => {
    const { tenantId, userId } = ctx(req);
    const steps = await prisma.workflowStep.findMany({
      where: { assigneeId: userId, status: "active", instance: { tenantId } },
      include: { instance: { select: { id: true, name: true, projectId: true, resourceType: true } } },
      orderBy: { dueDate: "asc" },
    });
    return { items: steps, total: steps.length };
  });

  app.get("/me/notifications", async (req) => {
    const { userId } = ctx(req);
    const query = (req.query ?? {}) as Record<string, string>;
    const items = await prisma.notification.findMany({
      where: { userId, ...(query.unread === "true" ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items, total: items.length };
  });

  app.patch("/me/notifications/:id/read", async (req) => {
    const { userId } = ctx(req);
    const { id } = req.params as { id: string };
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw ApiError.notFound();
    return { status: "read" };
  });
}
