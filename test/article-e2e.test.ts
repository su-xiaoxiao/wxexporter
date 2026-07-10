import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Stub logger so the import chain never initializes pino/pretty streams during tests.
vi.mock("../src/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Isolate FetchCache to a temp DB so tests don't pollute project .data/.
const TMP_CACHE = path.join(os.tmpdir(), `wxexport-cache-test-${process.pid}.db`);
beforeAll(() => {
  process.env.WXEXPORT_CACHE_DB = TMP_CACHE;
});
afterAll(() => {
  for (const f of [TMP_CACHE, `${TMP_CACHE}-wal`, `${TMP_CACHE}-shm`]) {
    try {
      rmSync(f);
    } catch {
      // ignore
    }
  }
});

import { articleRoutes } from "../src/server/routes/article.js";
import { LocalFacade } from "../src/facade/LocalFacade.js";
import { ArticleFetchError } from "../src/core/ScraplingFetcher.js";
import type { ArticleFetcher } from "../src/core/ArticleFetcher.js";

function fakeFetcher(overrides: Partial<{ title: string; markdown: string; cover: string }> = {}): ArticleFetcher {
  return {
    async fetchArticle(url: string) {
      return {
        title: "Fake Title",
        url,
        cover: "https://img/cover.jpg",
        markdown: "# Hello\n\nworld",
        ...overrides,
      };
    },
  };
}

function app(fetcher: ArticleFetcher) {
  const facade = new LocalFacade(fetcher);
  const hono = new Hono();
  hono.route("/article", articleRoutes(facade));
  return hono;
}

describe("POST /article (E2E, fake fetcher + FetchCache)", () => {
  it("returns Article JSON for a valid url (first fetch, cached:false)", async () => {
    const res = await app(fakeFetcher()).request(
      "/article?url=https://mp.weixin.qq.com/s/x",
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      title: "Fake Title",
      url: "https://mp.weixin.qq.com/s/x",
      cover: "https://img/cover.jpg",
      markdown: "# Hello\n\nworld",
      cached: false,
    });
  });

  it("serves cached on second fetch of same url (cached:true, no fetcher call)", async () => {
    let calls = 0;
    const counting: ArticleFetcher = {
      async fetchArticle(url: string) {
        calls++;
        return { title: "T", url, cover: "c", markdown: "# m" };
      },
    };
    const a = app(counting);
    await a.request("/article?url=https://mp.weixin.qq.com/s/y", { method: "POST" });
    const res2 = await a.request("/article?url=https://mp.weixin.qq.com/s/y", { method: "POST" });
    const body2 = await res2.json();
    expect(calls).toBe(1); // second call served from cache, fetcher not invoked
    expect(body2.cached).toBe(true);
  });

  it("force=1 bypasses cache and refetches", async () => {
    let calls = 0;
    const counting: ArticleFetcher = {
      async fetchArticle(url: string) {
        calls++;
        return { title: `T${calls}`, url, cover: "c", markdown: `# m${calls}` };
      },
    };
    const a = app(counting);
    await a.request("/article?url=https://mp.weixin.qq.com/s/z", { method: "POST" });
    const res2 = await a.request("/article?url=https://mp.weixin.qq.com/s/z&force=1", { method: "POST" });
    const body2 = await res2.json();
    expect(calls).toBe(2); // force refetched
    expect(body2.cached).toBe(false);
    expect(body2.markdown).toBe("# m2");
  });

  it("returns 400 for an invalid url", async () => {
    const res = await app(fakeFetcher()).request("/article?url=not-a-url", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("returns 502 when the fetcher fails with ArticleFetchError (force bypasses cache)", async () => {
    const failing: ArticleFetcher = {
      async fetchArticle(url: string) {
        throw new ArticleFetchError("fetch_failed", url, new Error("boom"));
      },
    };
    const res = await app(failing).request(
      "/article?url=https://mp.weixin.qq.com/s/x&force=1",
      { method: "POST" },
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("fetch_failed");
  });
});
