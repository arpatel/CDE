import "fastify";
import type { AuthContext } from "../middleware/authenticate.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
