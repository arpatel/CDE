import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(8, "JWT_ACCESS_SECRET must be set"),
  JWT_REFRESH_SECRET: z.string().min(8, "JWT_REFRESH_SECRET must be set"),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(2_592_000),
  // OnlyOffice Document Server (in-browser editing). Shared secret signs the
  // editor config + verifies save-back callbacks. PUBLIC_URL is browser-facing
  // (loads api.js); API_INTERNAL_URL is how the DS container reaches this API.
  ONLYOFFICE_JWT_SECRET: z.string().min(8).default("dev-onlyoffice-secret-change-me"),
  ONLYOFFICE_PUBLIC_URL: z.string().default("http://localhost:8082"),
  API_INTERNAL_URL: z.string().default("http://host.docker.internal:4000/v1"),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
