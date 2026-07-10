import type { ArticleFetcher } from "./ArticleFetcher.js";
import type { Article } from "./types.js";
import { runScrapling, ScraplingRunnerError } from "./ScraplingRunner.js";
import { logger } from "../logger.js";

/**
 * Error surfaced to facade/CLI/HTTP callers. Carries the url; the underlying
 * ScraplingRunnerError (with stderr) is on .cause.
 */
export class ArticleFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ArticleFetchError";
  }
}

/**
 * Default ArticleFetcher implementation: spawns the scrapling Python subprocess
 * and maps its result to an Article. All subprocess errors are logged here
 * (A1) and re-thrown as ArticleFetchError so callers handle one error type.
 */
export class ScraplingFetcher implements ArticleFetcher {
  constructor(private readonly opts: { timeoutMs?: number } = {}) {}

  async fetchArticle(url: string): Promise<Article> {
    try {
      const res = await runScrapling(url, this.opts);
      return {
        title: res.title,
        url,
        cover: res.cover_url,
        markdown: res.markdown,
      };
    } catch (err) {
      if (err instanceof ScraplingRunnerError) {
        logger.error(
          { url, stderr: err.stderr, exitCode: err.exitCode, timedOut: err.timedOut },
          "scrapling fetch failed",
        );
      }
      throw new ArticleFetchError(`failed to fetch article: ${url}`, url, err);
    }
  }
}
