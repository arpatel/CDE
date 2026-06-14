import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ApiError, toProblemDetails } from "./lib/errors.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { identityRoutes } from "./modules/identity/identity.routes.js";
import { organizationRoutes } from "./modules/organization/organization.routes.js";
import { roleRoutes } from "./modules/role/role.routes.js";
import { projectRoutes } from "./modules/project/project.routes.js";
import { domainRoutes } from "./modules/domain/domain.routes.js";

const API_PREFIX = "/v1";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
    // X-Request-Id correlation for tracing / audit.
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, { origin: true, credentials: true });

  // Tolerate body-less action POSTs (checkout/close/approve) and JSON sent
  // without an explicit Content-Type — empty body parses to undefined rather
  // than throwing 415 Unsupported Media Type.
  app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    if (!body || body === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, undefined);
    }
  });

  // Unified error handler → RFC 7807 Problem Details (spec §3.5).
  app.setErrorHandler((error, req, reply) => {
    const instance = req.url;
    if (error instanceof ApiError) {
      return reply
        .code(error.status)
        .type("application/problem+json")
        .send(toProblemDetails(error, instance));
    }
    // Fastify body-parse / schema validation
    if ((error as { statusCode?: number }).statusCode === 400) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(toProblemDetails(ApiError.badRequest((error as Error).message), instance));
    }
    req.log.error({ err: error, reqId: req.id }, "Unhandled error");
    return reply
      .code(500)
      .type("application/problem+json")
      .send(
        toProblemDetails(
          new ApiError(500, "INTERNAL_ERROR", `Unexpected server error (ref ${req.id})`),
          instance,
        ),
      );
  });

  app.setNotFoundHandler((req, reply) => {
    reply
      .code(404)
      .type("application/problem+json")
      .send(toProblemDetails(ApiError.notFound(`No route for ${req.method} ${req.url}`), req.url));
  });

  // Health is unprefixed (orchestrator probes); domain APIs are under /v1.
  await app.register(healthRoutes);
  await app.register(
    async (v1) => {
      await v1.register(identityRoutes);
      await v1.register(organizationRoutes);
      await v1.register(roleRoutes);
      await v1.register(projectRoutes);
      await v1.register(domainRoutes);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
