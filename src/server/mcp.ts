import { Hono, type Context } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Facade } from "../facade/Facade.js";
import { ArticleFetchError } from "../core/ScraplingFetcher.js";
import { formatArticle } from "../core/format.js";
import { loadConfig } from "../cli/config.js";
import { logger } from "../logger.js";

/** Resolve authKey: param wins, else ~/.wxexport/config.json (same source as CLI). */
function resolveAuthKey(param?: string): string | null {
  if (param) return param;
  return loadConfig().authKey ?? null;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * createMcpApp — build the MCP server (4 tools over the shared Facade) and
 * mount it on a Hono app at /mcp. Caller mounts it on the same Hono process
 * as the HTTP API, sharing the facade singleton (eng review #8: "嵌 Hono 同
 * 进程共享 facade"). One port (PORT, default 3000) serves both HTTP API +
 * MCP — the SDK's WebStandardStreamableHTTPServerTransport takes a Web
 * Standard Request and returns a Response, so it slots straight into a Hono
 * route (official pattern, see webStandardStreamableHttp.d.ts).
 *
 * Stateless transport (sessionIdGenerator: undefined): each request is
 * independent, no in-memory session — simplest for a single-user常驻 service.
 *
 * SDK API verified against @modelcontextprotocol/sdk 1.29.0 .d.ts (McpServer
 * in server/mcp.d.ts, registerTool at line 150; tool() overloads are deprecated).
 */
export async function createMcpApp(facade: Facade): Promise<Hono> {
  const mcp = new McpServer({ name: "wxexporter", version: "0.3.0" });

  mcp.registerTool(
    "fetch_article",
    {
      description:
        "Fetch a WeChat article (mp.weixin.qq.com/s/...) as markdown, HTML, or JSON. No login needed.",
      inputSchema: {
        url: z.string().url().describe("Article URL (mp.weixin.qq.com/s/...)"),
        format: z.enum(["md", "html", "json"]).optional().describe("Output format (default md)"),
      },
    },
    async ({ url, format }) => {
      try {
        const article = await facade.fetchArticle(url);
        return ok(formatArticle(article, format ?? "md"));
      } catch (err) {
        const msg = err instanceof ArticleFetchError ? err.message : String(err);
        return fail(`fetch_failed: ${msg}`);
      }
    },
  );

  mcp.registerTool(
    "list_articles",
    {
      description:
        "List published articles of a WeChat account (by fakeid). Requires login (authKey).",
      inputSchema: {
        fakeid: z.string().describe("Account fakeid (find it with search_biz)"),
        begin: z.number().optional().describe("Offset (default 0)"),
        count: z.number().optional().describe("Page size (default 5)"),
        authKey: z.string().optional().describe("Override authKey (default: ~/.wxexport/config.json)"),
      },
    },
    async ({ fakeid, begin, count, authKey }) => {
      const key = resolveAuthKey(authKey);
      if (!key) return fail("no authKey — run `wxexport login`, or pass authKey param");
      const r = await facade.listArticles(key, fakeid, begin ?? 0, count ?? 5);
      if (!r.ok) return fail(JSON.stringify({ error: r.error, expired: r.expired, ret: r.ret }));
      return ok(JSON.stringify({ total: r.data.total, articles: r.data.articles }));
    },
  );

  mcp.registerTool(
    "search_biz",
    {
      description:
        "Search WeChat accounts by keyword; returns fakeid/nickname. Requires login (authKey).",
      inputSchema: {
        query: z.string().describe("Account name keyword"),
        begin: z.number().optional().describe("Offset (default 0)"),
        count: z.number().optional().describe("Page size (default 5)"),
        authKey: z.string().optional().describe("Override authKey (default: ~/.wxexport/config.json)"),
      },
    },
    async ({ query, begin, count, authKey }) => {
      const key = resolveAuthKey(authKey);
      if (!key) return fail("no authKey — run `wxexport login`, or pass authKey param");
      const r = await facade.searchBiz(key, query, begin ?? 0, count ?? 5);
      if (!r.ok) return fail(JSON.stringify({ error: r.error, expired: r.expired, ret: r.ret }));
      return ok(JSON.stringify({ total: r.data.total, list: r.data.list }));
    },
  );

  mcp.registerTool(
    "check_login",
    {
      description: "Check whether the saved WeChat login (authKey) is still valid.",
      inputSchema: {
        authKey: z.string().optional().describe("Override authKey (default: ~/.wxexport/config.json)"),
      },
    },
    async ({ authKey }) => {
      const key = resolveAuthKey(authKey);
      if (!key) return fail("no authKey — run `wxexport login`");
      const r = await facade.checkLogin(key);
      if (!r.ok) return ok(JSON.stringify({ status: "expired", ret: r.ret }));
      return ok(JSON.stringify({ status: "ok", ret: r.data.ret }));
    },
  );

  // Stateless streamable HTTP: the SDK forbids reusing a transport across
  // requests ("Stateless transport cannot be reused across requests"), so we
  // create + connect a fresh transport per request, then close it. The
  // McpServer instance (and its registered tools) is shared across requests —
  // connect just wires this request's transport to the shared handlers.
  logger.info("MCP server mounted at /mcp (stateless streamable HTTP)");

  const app = new Hono();
  const handle = async (c: Context) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await mcp.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await transport.close();
    }
  };
  app.all("/mcp", handle);
  app.all("/mcp/", handle);
  return app;
}
