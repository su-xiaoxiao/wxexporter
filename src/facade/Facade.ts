import type { Article } from "../core/types.js";

/**
 * Facade — the single capability surface. HTTP / CLI / (M3) MCP all call this,
 * so capability is implemented once, not three times.
 *
 * LocalFacade delegates in-process to an ArticleFetcher (used by the server
 * itself + server-side CLI). RemoteFacade (M2) calls the HTTP service over the
 * wire — same interface, so client编排 code is transport-agnostic.
 *
 * Error contract: implementations throw ArticleFetchError on fetch failure
 * (so RemoteFacade maps HTTP errors back to the same type — eng review CQ1).
 */
export interface Facade {
  fetchArticle(url: string): Promise<Article>;
}
