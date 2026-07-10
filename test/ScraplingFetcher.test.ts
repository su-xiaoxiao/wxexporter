import { describe, it, expect, vi } from "vitest";

// Stub the logger so no pino side effects during tests.
vi.mock("../src/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Partial mock of ScraplingRunner: keep the real ScraplingRunnerError class
// (so `instanceof` works in ScraplingFetcher), replace runScrapling with a spy
// so no Python subprocess is spawned.
vi.mock("../src/core/ScraplingRunner.js", async (importActual) => {
  const actual = await importActual<typeof import("../src/core/ScraplingRunner.js")>();
  return { ...actual, runScrapling: vi.fn() };
});

const { ScraplingFetcher, ArticleFetchError } = await import("../src/core/ScraplingFetcher.js");
const { runScrapling, ScraplingRunnerError } = await import("../src/core/ScraplingRunner.js");

const URL = "https://mp.weixin.qq.com/s/abc";
const mockRun = runScrapling as unknown as ReturnType<typeof vi.fn>;

describe("ScraplingFetcher", () => {
  it("maps a successful runner result to an Article", async () => {
    mockRun.mockResolvedValue({
      title: "标题",
      cover_url: "https://img/cover.jpg",
      markdown: "# 正文",
    });
    const fetcher = new ScraplingFetcher();
    const article = await fetcher.fetchArticle(URL);
    expect(article).toEqual({
      title: "标题",
      url: URL,
      cover: "https://img/cover.jpg",
      markdown: "# 正文",
    });
  });

  it("wraps a ScraplingRunnerError (non-zero exit) into ArticleFetchError", async () => {
    mockRun.mockRejectedValue(
      new ScraplingRunnerError("exited 2", URL, "scrapling not found", 2, false),
    );
    const fetcher = new ScraplingFetcher();
    await expect(fetcher.fetchArticle(URL)).rejects.toBeInstanceOf(ArticleFetchError);
  });

  it("wraps a timeout into ArticleFetchError carrying the url", async () => {
    mockRun.mockRejectedValue(
      new ScraplingRunnerError("timed out after 60000ms", URL, "", null, true),
    );
    const fetcher = new ScraplingFetcher();
    await expect(fetcher.fetchArticle(URL)).rejects.toMatchObject({
      name: "ArticleFetchError",
      url: URL,
    });
  });

  it("wraps an unexpected error into ArticleFetchError", async () => {
    mockRun.mockRejectedValue(new Error("boom"));
    const fetcher = new ScraplingFetcher();
    await expect(fetcher.fetchArticle(URL)).rejects.toBeInstanceOf(ArticleFetchError);
  });
});
