import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { LocalFacade } from "../facade/LocalFacade.js";
import { ScraplingFetcher } from "../core/ScraplingFetcher.js";
import { articleRoutes } from "./routes/article.js";
import { statusApp } from "./routes/status.js";
import { loginApp } from "./routes/login.js";
import { mpApp } from "./routes/mp.js";
import { createMcpApp } from "./mcp.js";
import { logger } from "../logger.js";

const app = new Hono();

const facade = new LocalFacade(new ScraplingFetcher());

app.route("/article", articleRoutes(facade));
app.route("/status", statusApp);
app.route("/login", loginApp);
app.route("/mp", mpApp(facade));

const port = Number(process.env.PORT ?? 3000);

// MCP mounts at /mcp on the same Hono app/process — shares the facade
// singleton (eng review #8: 嵌 Hono 同进程共享 facade). createMcpApp connects
// the transport (async), so the HTTP server starts after it's ready.
(async () => {
  const mcpApp = await createMcpApp(facade);
  app.route("/", mcpApp);
  serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, "wxexporter server started (HTTP + MCP /mcp)");
  });
})().catch((err) => {
  logger.error({ err: (err as Error).message }, "failed to start server");
  process.exit(1);
});
