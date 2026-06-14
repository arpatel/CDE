import type { FastifyInstance } from "fastify";
import { prisma } from "@cde/db";

// Liveness + readiness. Readiness pings the database so orchestrators only route
// traffic when dependencies are healthy.
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  app.get("/health/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready", db: "up" };
    } catch {
      return reply.code(503).send({ status: "unavailable", db: "down" });
    }
  });
}
