import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    app.log.info(`CDE API listening on http://${env.API_HOST}:${env.API_PORT}${""}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
