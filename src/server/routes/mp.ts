import { Hono, type Context } from "hono";
import type { Facade, MpErr } from "../../facade/Facade.js";
import { recordRequest } from "../status.js";

function mpFailure(c: Context, error: MpErr) {
  recordRequest({
    url: c.req.path,
    status: "error",
    ts: Date.now(),
    ret: error.ret,
  });
  if (error.ret === 200013)
    return c.json(
      {
        error: error.error,
        base_resp: { ret: error.ret },
        status: "restricted",
      },
      429,
    );
  if (error.expired)
    return c.json(
      { error: error.error, base_resp: { ret: error.ret }, status: "expired" },
      401,
    );
  return c.json({ error: error.error, status: "error" }, 502);
}

/** 从请求取 authKey(X-Auth-Key header 优先,否则 auth-key cookie)。 */
function authKey(c: Context): string | null {
  const fromHeader = c.req.header("X-Auth-Key");
  if (fromHeader) return fromHeader;
  const cookie = c.req.header("cookie") ?? "";
  const m = cookie.match(/auth-key=([^;]+)/);
  return m?.[1] ?? null;
}

/** HTTP transport for the shared list/search/check capabilities. */
export function mpApp(facade: Facade) {
  const app = new Hono();

  // GET /mp/articles?fakeid=&begin=0&count=5 → 按公众号列文章
  app.get("/articles", async (c) => {
    const key = authKey(c);
    if (!key)
      return c.json(
        { error: "no authKey (X-Auth-Key header or auth-key cookie)" },
        401,
      );
    const fakeid = c.req.query("fakeid");
    if (!fakeid) return c.json({ error: "fakeid required" }, 400);
    const begin = Number(c.req.query("begin") ?? 0);
    const count = Number(c.req.query("count") ?? 5);

    const r = await facade.listArticles(key, fakeid, begin, count);
    if (!r.ok) return mpFailure(c, r);
    recordRequest({ url: c.req.path, status: "ok", ts: Date.now() });
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
    if (!r.ok) return mpFailure(c, r);
    recordRequest({ url: c.req.path, status: "ok", ts: Date.now() });
    return c.json({ total: r.data.total, list: r.data.list });
  });

  // GET /mp/check → checkLogin: 探测 token 是否有效
  app.get("/check", async (c) => {
    const key = authKey(c);
    if (!key) return c.json({ status: "expired", reason: "no authKey" }, 401);
    const r = await facade.checkLogin(key);
    if (!r.ok) return mpFailure(c, r);
    return c.json({ status: "ok", ret: r.data.ret });
  });

  return app;
}
