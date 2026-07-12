import { describe, it, expect, vi } from "vitest";
import { createMcpApp } from "../src/server/mcp.js";
import type { Facade } from "../src/facade/Facade.js";

/** Mock facade — all methods are vi.fn so we can assert calls + shape. */
function mockFacade(): Facade & {
  fetchArticle: ReturnType<typeof vi.fn>;
  listArticles: ReturnType<typeof vi.fn>;
  searchBiz: ReturnType<typeof vi.fn>;
  checkLogin: ReturnType<typeof vi.fn>;
} {
  return {
    fetchArticle: vi.fn(async (url: string) => ({
      title: "T",
      url,
      cover: "",
      markdown: "# hi",
    })),
    listArticles: vi.fn(async () => ({ ok: true, data: { total: 0, articles: [] } })),
    searchBiz: vi.fn(async () => ({ ok: true, data: { total: 0, list: [] } })),
    checkLogin: vi.fn(async () => ({ ok: true, data: { ret: 0 } })),
  } as unknown as Facade & {
    fetchArticle: ReturnType<typeof vi.fn>;
    listArticles: ReturnType<typeof vi.fn>;
    searchBiz: ReturnType<typeof vi.fn>;
    checkLogin: ReturnType<typeof vi.fn>;
  };
}

const INIT = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "wxexporter-test", version: "1.0" },
  },
};

async function rpc(app: Awaited<ReturnType<typeof createMcpApp>>, body: unknown) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  return res;
}

async function bootstrap(app: Awaited<ReturnType<typeof createMcpApp>>) {
  await rpc(app, INIT);
  await rpc(app, { jsonrpc: "2.0", method: "notifications/initialized" });
}

describe("MCP adapter (/mcp, stateless streamable HTTP)", () => {
  it("lists the 4 tools", async () => {
    const app = await createMcpApp(mockFacade());
    await bootstrap(app);
    const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(200);
    const obj = JSON.parse(await res.text());
    const names = obj.result.tools.map((t: { name: string }) => t.name);
    expect(names).toHaveLength(4);
    expect(names).toEqual(
      expect.arrayContaining(["fetch_article", "list_articles", "search_biz", "check_login"]),
    );
  });

  it("fetch_article (md) calls facade + returns markdown content", async () => {
    const facade = mockFacade();
    const app = await createMcpApp(facade);
    await bootstrap(app);
    const res = await rpc(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "fetch_article", arguments: { url: "https://mp.weixin.qq.com/s/x" } },
    });
    expect(res.status).toBe(200);
    const obj = JSON.parse(await res.text());
    expect(obj.result.content[0].text).toContain("# hi");
    expect(facade.fetchArticle).toHaveBeenCalledWith("https://mp.weixin.qq.com/s/x");
  });

  it("fetch_article format=html → HTML body", async () => {
    const app = await createMcpApp(mockFacade());
    await bootstrap(app);
    const res = await rpc(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "fetch_article",
        arguments: { url: "https://mp.weixin.qq.com/s/x", format: "html" },
      },
    });
    expect(res.status).toBe(200);
    const obj = JSON.parse(await res.text());
    expect(obj.result.content[0].text).toContain("<!doctype html>");
  });

  it("fetch_article on facade error → isError:true", async () => {
    const facade = mockFacade();
    facade.fetchArticle.mockRejectedValueOnce(new Error("boom"));
    const app = await createMcpApp(facade);
    await bootstrap(app);
    const res = await rpc(app, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "fetch_article", arguments: { url: "https://mp.weixin.qq.com/s/x" } },
    });
    expect(res.status).toBe(200);
    const obj = JSON.parse(await res.text());
    expect(obj.result.isError).toBe(true);
    expect(obj.result.content[0].text).toContain("fetch_failed");
  });
});
