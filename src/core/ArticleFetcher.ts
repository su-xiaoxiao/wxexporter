import type { Article } from "./types.js";

/**
 * Fetcher interface. Two reasons it's an interface (not a concrete class):
 *  - Tests mock it: the core/facade/HTTP/CLI all depend on this interface, so
 *    unit tests inject a fake fetcher instead of spawning Python (eng review T1).
 *  - Engine is swappable: scrapling is the default impl; another fetcher can
 *    implement this later without touching callers (eng review A4).
 */
export interface ArticleFetcher {
  fetchArticle(url: string): Promise<Article>;
}
