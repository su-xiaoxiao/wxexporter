import type { Facade } from "./Facade.js";
import type { Article } from "../core/types.js";
import type { ArticleFetcher } from "../core/ArticleFetcher.js";
import { ArticleFetchError } from "../core/ScraplingFetcher.js";

/**
 * In-process facade: delegates straight to an ArticleFetcher (default
 * ScraplingFetcher). Used by the server itself and the server-side CLI.
 *
 * RemoteFacade (M2) will wrap the HTTP service with the same interface, so
 * callers don't change when switching local↔remote transport.
 */
export class LocalFacade implements Facade {
  constructor(private readonly fetcher: ArticleFetcher) {}

  async fetchArticle(url: string): Promise<Article> {
    try {
      return await this.fetcher.fetchArticle(url);
    } catch (err) {
      // Pass ArticleFetchError through; wrap anything unexpected so callers
      // only ever see ArticleFetchError (eng review CQ1: one error contract).
      if (err instanceof ArticleFetchError) throw err;
      throw new ArticleFetchError(`unexpected fetcher error: ${url}`, url, err);
    }
  }
}
