import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { LocalFacade } from "../facade/LocalFacade.js";
import { ScraplingFetcher } from "../core/ScraplingFetcher.js";
import { articleRoutes } from "./routes/article.js";
import { statusApp } from "./routes/status.js";
import { loginApp } from "./routes/login.js";
import { mpApp } from "./routes/mp.js";
import { logger } from "../logger.js";

const app = new Hono();

const facade = new LocalFacade(new ScraplingFetcher());

app.route("/article", articleRoutes(facade));
app.route("/status", statusApp);
app.route("/login", loginApp);
app.route("/mp", mpApp);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "wxexporter server started");
});
