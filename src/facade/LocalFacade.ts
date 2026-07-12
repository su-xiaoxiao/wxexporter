import type {
  Facade,
  MpResult,
  MpErr,
  ArticleListData,
  AccountListData,
  LoginCheckData,
} from "./Facade.js";
import type { Article } from "../core/types.js";
import type { ArticleFetcher } from "../core/ArticleFetcher.js";
import { ArticleFetchError } from "../core/ScraplingFetcher.js";
import { proxyMpRequest, decodeMpBody } from "../auth/proxyMpRequest.js";
import { cookieVault } from "../auth/CookieVault.js";
import type { AppMsgPublishResponse, SearchBizResponse } from "../server/wxTypes.js";
import { parseArticles } from "../server/wxTypes.js";

const APPMSGPUBLISH = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish";
const SEARCHBIZ = "https://mp.weixin.qq.com/cgi-bin/searchbiz";

/** Login-gated failure: authKey unknown or wechat says session expired (ret≠0). */
function mpExpired(ret: number | undefined, reason: string): MpErr {
  return { ok: false, expired: true, ret, error: reason };
}
/** Non-expiry wechat failure (non-JSON body, network, etc). */
function mpErr(error: string, raw: string): MpErr {
  return { ok: false, expired: false, error, raw };
}

/**
 * In-process facade: delegates straight to an ArticleFetcher (default
 * ScraplingFetcher) for article fetch, and to the mp proxy (proxyMpRequest +
 * cookieVault) for list/search/check. Used by the server itself, the
 * server-side CLI, and the M3 MCP adapter.
 *
 * RemoteFacade (M2) wraps the HTTP service with the same interface, so
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

  async listArticles(
    authKey: string,
    fakeid: string,
    begin: number,
    count: number,
  ): Promise<MpResult<ArticleListData>> {
    const token = cookieVault.getToken(authKey);
    if (!token) return mpExpired(undefined, "expired or unknown authKey");
    const res = await proxyMpRequest({
      method: "GET",
      endpoint: APPMSGPUBLISH,
      authKey,
      query: {
        sub: "list",
        search_field: "null",
        begin,
        count,
        fakeid,
        type: "101_1",
        free_publish_type: 1,
        sub_action: "list_ex",
        token,
        lang: "zh_CN",
        f: "json",
        ajax: 1,
      },
    });
    const bodyText = decodeMpBody(res.body);
    let resp: AppMsgPublishResponse;
    try {
      resp = JSON.parse(bodyText) as AppMsgPublishResponse;
    } catch {
      return mpErr("wechat returned non-JSON", bodyText.slice(0, 300));
    }
    if (resp.base_resp?.ret !== 0) {
      return mpExpired(resp.base_resp?.ret, "wechat api error");
    }
    const { total, articles } = parseArticles(resp.publish_page);
    return { ok: true, data: { total, articles } };
  }

  async searchBiz(
    authKey: string,
    query: string,
    begin: number,
    count: number,
  ): Promise<MpResult<AccountListData>> {
    const token = cookieVault.getToken(authKey);
    if (!token) return mpExpired(undefined, "expired or unknown authKey");
    const res = await proxyMpRequest({
      method: "GET",
      endpoint: SEARCHBIZ,
      authKey,
      query: {
        action: "search_biz",
        begin,
        count,
        query,
        token,
        lang: "zh_CN",
        f: "json",
        ajax: 1,
      },
    });
    const bodyText = decodeMpBody(res.body);
    let resp: SearchBizResponse;
    try {
      resp = JSON.parse(bodyText) as SearchBizResponse;
    } catch {
      return mpErr("wechat returned non-JSON", bodyText.slice(0, 300));
    }
    if (resp.base_resp?.ret !== 0) {
      return mpExpired(resp.base_resp?.ret, "wechat api error");
    }
    return { ok: true, data: { total: resp.total, list: resp.list } };
  }

  async checkLogin(authKey: string): Promise<MpResult<LoginCheckData>> {
    const token = cookieVault.getToken(authKey);
    if (!token) return mpExpired(undefined, "expired or unknown authKey");
    const res = await proxyMpRequest({
      method: "GET",
      endpoint: APPMSGPUBLISH,
      authKey,
      query: {
        sub: "list",
        begin: 0,
        count: 1,
        fakeid: "",
        type: "101_1",
        free_publish_type: 1,
        sub_action: "list_ex",
        token,
        lang: "zh_CN",
        f: "json",
        ajax: 1,
      },
    });
    const bodyText = decodeMpBody(res.body);
    try {
      const resp = JSON.parse(bodyText) as AppMsgPublishResponse;
      const ret = resp.base_resp?.ret ?? -1;
      if (ret === 0) return { ok: true, data: { ret } };
      return mpExpired(ret, "login expired");
    } catch {
      return mpErr("wechat returned non-JSON", bodyText.slice(0, 200));
    }
  }
}
