import type { z } from "zod";
import { ApiError } from "./errors.js";

// Parse unknown input with a Zod schema, converting failures into a 400
// VALIDATION_ERROR problem-details response.
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw ApiError.badRequest(issues);
  }
  return result.data;
}
