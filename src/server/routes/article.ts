import { Hono } from "hono";
import { z } from "zod";
import type { Facade } from "../../facade/Facade.js";
import { ArticleFetchError } from "../../core/ScraplingFetcher.js";
import { recordRequest } from "../status.js";
import { getCached, setCached } from "../cache.js";

const querySchema = z.object({
  url: z.string().url(),
  /** force=1 绕过 FetchCache 重抓(eng review #5)。 */
  force: z.enum(["1", "true", "yes"]).optional(),
});

/**
 * POST /article?url=<mp-url>[&force=1]
 * FetchCache:命中且非 force → 返缓存;否则抓取并存缓存。
 */
export function articleRoutes(facade: Facade) {
  const app = new Hono();

  app.post("/", async (c) => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid url", detail: parsed.error.flatten() }, 400);
    }
    const { url, force } = parsed.data;

    if (!force) {
      const cached = getCached(url);
      if (cached) {
        recordRequest({ url, status: "ok", ts: Date.now() });
        return c.json({
          title: cached.title,
          url,
          cover: cached.cover,
          markdown: cached.markdown,
          cached: true,
        });
      }
    }

    try {
      const article = await facade.fetchArticle(url);
      setCached({
        url: article.url,
        title: article.title,
        cover: article.cover,
        markdown: article.markdown,
      });
      recordRequest({ url, status: "ok", ts: Date.now() });
      return c.json({ ...article, cached: false });
    } catch (err) {
      recordRequest({ url, status: "error", ts: Date.now() });
      if (err instanceof ArticleFetchError) {
        return c.json({ error: "fetch_failed", url: err.url, message: err.message }, 502);
      }
      return c.json({ error: "internal", message: (err as Error).message }, 500);
    }
  });

  return app;
}
