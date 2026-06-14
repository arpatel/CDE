import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../lib/validation.js";
import { authenticate, ctx } from "../../middleware/authenticate.js";
import * as identity from "./identity.service.js";

const RegisterSchema = z.object({
  tenantName: z.string().min(2).max(120),
  displayName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantDomain: z.string().optional(),
});

const RefreshSchema = z.object({ refreshToken: z.string().min(10) });

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  function meta(req: { ip: string; headers: Record<string, unknown> }) {
    return { ip: req.ip, userAgent: (req.headers["user-agent"] as string) ?? null };
  }

  // POST /auth/register — self-service tenant + admin onboarding
  app.post("/auth/register", async (req, reply) => {
    const body = parse(RegisterSchema, req.body);
    const tokens = await identity.registerTenant({ ...body, meta: meta(req) });
    return reply.code(201).send(tokens);
  });

  // POST /auth/token — password grant (login)
  app.post("/auth/token", async (req) => {
    const body = parse(LoginSchema, req.body);
    return identity.login({ ...body, meta: meta(req) });
  });

  // Alias kept for clarity
  app.post("/auth/login", async (req) => {
    const body = parse(LoginSchema, req.body);
    return identity.login({ ...body, meta: meta(req) });
  });

  // POST /auth/token/refresh — rotate refresh token
  app.post("/auth/token/refresh", async (req) => {
    const body = parse(RefreshSchema, req.body);
    return identity.refresh({ refreshToken: body.refreshToken, meta: meta(req) });
  });

  // POST /auth/logout — revoke session
  app.post("/auth/logout", async (req) => {
    const body = parse(RefreshSchema, req.body);
    await identity.logout(body.refreshToken);
    return { status: "logged_out" };
  });

  // GET /auth/me — current user profile + permissions
  app.get("/auth/me", { preHandler: authenticate }, async (req) => {
    return identity.getProfile(ctx(req).userId);
  });
}
