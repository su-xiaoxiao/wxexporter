import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Stub logger so the import chain (article → LocalFacade → ScraplingFetcher → logger)
// never initializes pino/pretty streams during tests.
vi.mock("../src/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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

describe("POST /article (E2E, fake fetcher)", () => {
  it("returns Article JSON for a valid url", async () => {
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
    });
  });

  it("returns 400 for an invalid url", async () => {
    const res = await app(fakeFetcher()).request("/article?url=not-a-url", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("returns 502 when the fetcher fails with ArticleFetchError", async () => {
    const failing: ArticleFetcher = {
      async fetchArticle(url: string) {
        throw new ArticleFetchError("fetch_failed", url, new Error("boom"));
      },
    };
    const res = await app(failing).request(
      "/article?url=https://mp.weixin.qq.com/s/x",
      { method: "POST" },
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("fetch_failed");
  });
});
