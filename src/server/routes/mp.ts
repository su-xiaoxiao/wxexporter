import { Hono, type Context } from "hono";
import type { Facade } from "../../facade/Facade.js";

/** 从请求取 authKey(X-Auth-Key header 优先,否则 auth-key cookie)。 */
function authKey(c: Context): string | null {
  const fromHeader = c.req.header("X-Auth-Key");
  if (fromHeader) return fromHeader;
  const cookie = c.req.header("cookie") ?? "";
  const m = cookie.match(/auth-key=([^;]+)/);
  return m?.[1] ?? null;
}

/**
 * /mp routes — thin HTTP wrappers over the Facade. The list/search/check
 * capability lives in LocalFacade (shared by MCP adapter, eng review #8);
 * these routes only map authKey + query params → facade call → HTTP status.
 *
 * Behavior preserved from M2: /articles & /search return {total, articles|list}
 * on 200, {error, status:"expired"} on 401 (ret≠0 / unknown authKey),
 * {error, raw} on 502 (non-JSON). /check returns {status:"ok"|"expired", ret}.
 */
export function mpApp(facade: Facade) {
  const app = new Hono();

  // GET /mp/articles?fakeid=&begin=0&count=5 → 按公众号列文章
  app.get("/articles", async (c) => {
    const key = authKey(c);
    if (!key) return c.json({ error: "no authKey (X-Auth-Key header or auth-key cookie)" }, 401);
    const fakeid = c.req.query("fakeid");
    if (!fakeid) return c.json({ error: "fakeid required" }, 400);
    const begin = Number(c.req.query("begin") ?? 0);
    const count = Number(c.req.query("count") ?? 5);

    const r = await facade.listArticles(key, fakeid, begin, count);
    if (!r.ok) {
      if (r.expired) {
        return c.json({ error: "wechat api error", base_resp: { ret: r.ret }, status: "expired" }, 401);
      }
      return c.json({ error: "wechat returned non-JSON", raw: r.raw }, 502);
    }
    return c.json({ total: r.data.total, articles: r.data.articles });
  });

  // GET /mp/search?query= → 搜公众号(返 fakeid/nickname)
  app.get("/search", async (c) => {
    const key = authKey(c);
    if (!key) return c.json({ error: "no authKey" }, 401);
    const query = c.req.query("query");
    if (!query) return c.json({ error: "query required" }, 400);
    const begin = Number(c.req.query("begin") ?? 0);
    const count = Number(c.req.query("count") ?? 5);

    const r = await facade.searchBiz(key, query, begin, count);
    if (!r.ok) {
      if (r.expired) {
        return c.json({ error: "wechat api error", base_resp: { ret: r.ret }, status: "expired" }, 401);
      }
      return c.json({ error: "wechat returned non-JSON", raw: r.raw }, 502);
    }
    return c.json({ total: r.data.total, list: r.data.list });
  });

  // GET /mp/check → checkLogin: 探测 token 是否有效
  app.get("/check", async (c) => {
    const key = authKey(c);
    if (!key) return c.json({ status: "expired", reason: "no authKey" }, 401);
    const r = await facade.checkLogin(key);
    if (!r.ok) {
      if (r.expired) return c.json({ status: "expired", ret: r.ret }, 401);
      return c.json({ status: "expired", raw: r.raw }, 401);
    }
    return c.json({ status: "ok", ret: r.data.ret });
  });

  return app;
}
