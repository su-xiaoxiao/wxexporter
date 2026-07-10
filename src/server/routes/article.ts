import { Hono } from "hono";
import { z } from "zod";
import type { Facade } from "../../facade/Facade.js";
import { ArticleFetchError } from "../../core/ScraplingFetcher.js";
import { recordRequest } from "../status.js";

const querySchema = z.object({
  url: z.string().url(),
});

/**
 * POST /article?url=<mp-url>
 * Returns { title, url, cover, markdown } on success, 4xx/5xx on failure.
 * Every request is recorded for the /status page (operational visibility).
 */
export function articleRoutes(facade: Facade) {
  const app = new Hono();

  app.post("/", async (c) => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid url", detail: parsed.error.flatten() }, 400);
    }
    const { url } = parsed.data;

    try {
      const article = await facade.fetchArticle(url);
      recordRequest({ url, status: "ok", ts: Date.now() });
      return c.json(article);
    } catch (err) {
      recordRequest({ url, status: "error", ts: Date.now() });
      if (err instanceof ArticleFetchError) {
        // 502: upstream (scrapling / WeChat) failed. stderr is in the logs, not the body.
        return c.json({ error: "fetch_failed", url: err.url, message: err.message }, 502);
      }
      return c.json({ error: "internal", message: (err as Error).message }, 500);
    }
  });

  return app;
}
