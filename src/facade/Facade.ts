import type { Article } from "../core/types.js";
import type { AppMsgEx, AccountInfo } from "../server/wxTypes.js";

/**
 * Facade — the single capability surface. HTTP / CLI / MCP all call this,
 * so capability is implemented once, not three times.
 *
 * LocalFacade delegates in-process to an ArticleFetcher + the mp proxy
 * (used by the server itself + server-side CLI + M3 MCP adapter).
 * RemoteFacade (M2) calls the HTTP service over the wire — same interface,
 * so client编排 code is transport-agnostic.
 *
 * Error contract (eng review CQ1: one error contract):
 *  - fetchArticle throws ArticleFetchError on fetch failure (RemoteFacade maps
 *    HTTP errors back to the same type).
 *  - list/search/check are login-gated (authKey → cookieVault). They NEVER throw
 *    on login expiry or wechat API errors — they return MpResult so callers
 *    (HTTP route / MCP tool) map to the right status (401 / 502) without
 *    try/catch plumbing. fetch throws because callers already handle it;
 *    mp returns because two distinct failure modes (expired vs wechat-error)
 *    need to be distinguished by the caller, not by exception type.
 */
export interface MpOk<T> {
  ok: true;
  data: T;
}
export interface MpErr {
  ok: false;
  /** true = login expired / authKey unknown (→ 401). false = other wechat error / non-JSON (→ 502). */
  expired: boolean;
  error?: string;
  ret?: number;
  raw?: string;
}
export type MpResult<T> = MpOk<T> | MpErr;

export interface ArticleListData {
  total: number;
  articles: AppMsgEx[];
}
export interface AccountListData {
  total: number;
  list: AccountInfo[];
}
export interface LoginCheckData {
  ret: number;
}

export interface Facade {
  fetchArticle(url: string): Promise<Article>;
  /** List published articles of an account (login-gated, authKey → cookieVault). */
  listArticles(
    authKey: string,
    fakeid: string,
    begin: number,
    count: number,
  ): Promise<MpResult<ArticleListData>>;
  /** Search accounts by keyword, returns fakeid (login-gated). */
  searchBiz(
    authKey: string,
    query: string,
    begin: number,
    count: number,
  ): Promise<MpResult<AccountListData>>;
  /** Probe whether the authKey's login is still valid (login-gated). */
  checkLogin(authKey: string): Promise<MpResult<LoginCheckData>>;
}
