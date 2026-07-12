import { Hono } from "hono";
import { z } from "zod";
import type { Facade } from "../../facade/Facade.js";
import type { Article } from "../../core/types.js";
import { formatArticle, type ArticleFormat } from "../../core/format.js";
import { ArticleFetchError } from "../../core/ScraplingFetcher.js";
import { recordRequest } from "../status.js";
import { getCached, setCached } from "../cache.js";

const querySchema = z.object({
  url: z.string().url(),
  /** force=1 绕过 FetchCache 重抓(eng review #5)。 */
  force: z.enum(["1", "true", "yes"]).optional(),
  /**
   * md (default) → JSON {title,url,cover,markdown,cached} (CLI export reads
   *   .markdown from it; preserves M1 behavior).
   * html → HTML doc (text/html); json → serialized Article (application/json).
   * M3 multi-format: html/json return a raw body + matching content-type.
   */
  format: z.enum(["md", "html", "json"]).optional(),
});

function contentTypeFor(fmt: ArticleFormat): string {
  if (fmt === "html") return "text/html; charset=utf-8";
  if (fmt === "json") return "application/json; charset=utf-8";
  return "text/markdown; charset=utf-8";
}

/**
 * POST /article?url=<mp-url>[&force=1][&format=md|html|json]
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
    const fmt: ArticleFormat = parsed.data.format ?? "md";

    if (!force) {
      const cached = getCached(url);
      if (cached) {
        recordRequest({ url, status: "ok", ts: Date.now() });
        const article: Article = {
          title: cached.title,
          url,
          cover: cached.cover,
          markdown: cached.markdown,
        };
        if (fmt === "md") {
          return c.json({ ...article, cached: true });
        }
        c.header("content-type", contentTypeFor(fmt));
        return c.body(formatArticle(article, fmt));
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
      if (fmt === "md") {
        return c.json({ ...article, cached: false });
      }
      c.header("content-type", contentTypeFor(fmt));
      return c.body(formatArticle(article, fmt));
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
