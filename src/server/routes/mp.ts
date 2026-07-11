import { Hono, type Context } from "hono";
import { proxyMpRequest, decodeMpBody } from "../../auth/proxyMpRequest.js";
import { cookieVault } from "../../auth/CookieVault.js";
import type {
  AppMsgPublishResponse,
  PublishPage,
  PublishInfo,
  AppMsgEx,
  SearchBizResponse,
} from "../wxTypes.js";

const APPMSGPUBLISH = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish";
const SEARCHBIZ = "https://mp.weixin.qq.com/cgi-bin/searchbiz";

/** 从请求取 authKey(X-Auth-Key header 优先,否则 auth-key cookie)。 */
function authKey(c: Context): string | null {
  const fromHeader = c.req.header("X-Auth-Key");
  if (fromHeader) return fromHeader;
  const cookie = c.req.header("cookie") ?? "";
  const m = cookie.match(/auth-key=([^;]+)/);
  return m?.[1] ?? null;
}

export const mpApp = new Hono();

// GET /mp/articles?fakeid=&begin=0&count=5 → 按公众号列文章(二次 parse publish_page)
mpApp.get("/articles", async (c) => {
  const key = authKey(c);
  if (!key) return c.json({ error: "no authKey (X-Auth-Key header or auth-key cookie)" }, 401);
  const token = cookieVault.getToken(key);
  if (!token) return c.json({ error: "expired or unknown authKey" }, 401);
  const fakeid = c.req.query("fakeid");
  if (!fakeid) return c.json({ error: "fakeid required" }, 400);
  const begin = Number(c.req.query("begin") ?? 0);
  const count = Number(c.req.query("count") ?? 5);

  const res = await proxyMpRequest({
    method: "GET",
    endpoint: APPMSGPUBLISH,
    authKey: key,
    query: {
      sub: "list", search_field: "null", begin, count, fakeid,
      type: "101_1", free_publish_type: 1, sub_action: "list_ex",
      token, lang: "zh_CN", f: "json", ajax: 1,
    },
  });

  const bodyText = decodeMpBody(res.body);
  let resp: AppMsgPublishResponse;
  try {
    resp = JSON.parse(bodyText) as AppMsgPublishResponse;
  } catch {
    return c.json({ error: "wechat returned non-JSON", raw: bodyText.slice(0, 300) }, 502);
  }
  if (resp.base_resp?.ret !== 0) {
    return c.json({ error: "wechat api error", base_resp: resp.base_resp, status: "expired" }, 401);
  }
  const publishPage = JSON.parse(resp.publish_page) as PublishPage;
  const articles: AppMsgEx[] = publishPage.publish_list
    .filter((item) => !!item.publish_info)
    .flatMap((item) => (JSON.parse(item.publish_info) as PublishInfo).appmsgex ?? []);
  return c.json({ total: publishPage.total_count, articles });
});

// GET /mp/search?query= → 搜公众号(返 fakeid/nickname)
mpApp.get("/search", async (c) => {
  const key = authKey(c);
  if (!key) return c.json({ error: "no authKey" }, 401);
  const token = cookieVault.getToken(key);
  if (!token) return c.json({ error: "expired or unknown authKey" }, 401);
  const query = c.req.query("query");
  if (!query) return c.json({ error: "query required" }, 400);
  const begin = Number(c.req.query("begin") ?? 0);
  const count = Number(c.req.query("count") ?? 5);

  const res = await proxyMpRequest({
    method: "GET",
    endpoint: SEARCHBIZ,
    authKey: key,
    query: { action: "search_biz", begin, count, query, token, lang: "zh_CN", f: "json", ajax: 1 },
  });
  const bodyText = decodeMpBody(res.body);
  let resp: SearchBizResponse;
  try {
    resp = JSON.parse(bodyText) as SearchBizResponse;
  } catch {
    return c.json({ error: "wechat returned non-JSON", raw: bodyText.slice(0, 300) }, 502);
  }
  if (resp.base_resp?.ret !== 0) {
    return c.json({ error: "wechat api error", base_resp: resp.base_resp, status: "expired" }, 401);
  }
  return c.json({ total: resp.total, list: resp.list });
});

// GET /mp/check → checkLogin: 调 appmsgpublish 探测 token 是否有效
mpApp.get("/check", async (c) => {
  const key = authKey(c);
  if (!key) return c.json({ status: "expired", reason: "no authKey" }, 401);
  const token = cookieVault.getToken(key);
  if (!token) return c.json({ status: "expired", reason: "unknown authKey" }, 401);
  const res = await proxyMpRequest({
    method: "GET",
    endpoint: APPMSGPUBLISH,
    authKey: key,
    query: {
      sub: "list", begin: 0, count: 1, fakeid: "",
      type: "101_1", free_publish_type: 1, sub_action: "list_ex",
      token, lang: "zh_CN", f: "json", ajax: 1,
    },
  });
  const bodyText = decodeMpBody(res.body);
  try {
    const resp = JSON.parse(bodyText) as AppMsgPublishResponse;
    const ok = resp.base_resp?.ret === 0;
    return c.json({ status: ok ? "ok" : "expired", ret: resp.base_resp?.ret });
  } catch {
    return c.json({ status: "expired", raw: bodyText.slice(0, 200) }, 401);
  }
});
