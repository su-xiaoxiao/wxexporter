import { marked } from "marked";
import type { Article } from "./types.js";

export type ArticleFormat = "md" | "html" | "json";

/**
 * formatArticle — render an Article in the requested format (M3 multi-format).
 *
 *  - md (default): raw markdown (what scrapling produces).
 *  - html: minimal valid HTML doc wrapping marked(markdown) + title + cover.
 *  - json: serialized Article (title/url/cover/markdown).
 *
 * This is NOT the原项目 utils/download/Exporter.ts pipeline — that's a
 * browser-side重导出器 (Nuxt/store/composables/FileSystemDirectoryHandle),
 * unusable on a headless Hono server. M3 plan decision: 轻量 server-side
 * format layer here; resource localization / image downloading stays with
 * the编排 agent (the service produces content, not assets).
 */
export function formatArticle(article: Article, format: ArticleFormat = "md"): string {
  switch (format) {
    case "json":
      return JSON.stringify(article, null, 2);
    case "html": {
      const body = marked.parse(article.markdown, { async: false }) as string;
      const cover = article.cover
        ? `  <img src="${escapeHtml(article.cover)}" alt="cover">\n`
        : "";
      return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(article.title)}</title>
</head>
<body>
  <h1>${escapeHtml(article.title)}</h1>
${cover}  ${body}
</body>
</html>`;
    }
    case "md":
    default:
      return article.markdown;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
