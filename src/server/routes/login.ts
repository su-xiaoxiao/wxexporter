import { Hono, type Context } from "hono";
import { proxyMpRequest } from "../../auth/proxyMpRequest.js";

const BIZLOGIN = "https://mp.weixin.qq.com/cgi-bin/bizlogin";
const SCANLOGINQRCODE = "https://mp.weixin.qq.com/cgi-bin/scanloginqrcode";

/** 从请求 cookie 头取 uuid(扫码流程 client 透传)。 */
function getUuid(c: Context): string | null {
  const cookie = c.req.header("cookie") ?? "";
  const m = cookie.match(/uuid=([^;]+)/);
  return m?.[1] ?? null;
}

/**
 * 扫码登录 4 endpoint(透明代理 mp.weixin.qq.com)。流程见 plan:
 *  session/:sid → qrcode(JPEG)→ scan(轮询)→ bizlogin(存 cookieVault + 返 authKey)。
 * uuid cookie 由 client 持有并透传(扫码流程用)。
 */
export const loginApp = new Hono();

// POST /login/session/:sid → 微信 bizlogin?action=startlogin → 返 Set-Cookie: uuid
loginApp.post("/session/:sid", async (c) => {
  const sid = c.req.param("sid");
  const res = await proxyMpRequest({
    method: "POST",
    endpoint: BIZLOGIN,
    query: { action: "startlogin", lang: "zh_CN", f: "json", ajax: 1 },
    body: { sessionid: sid, login_type: 3, token: "", lang: "zh_CN", f: "json", ajax: 1 },
    action: "start_login",
  });
  res.setCookies.forEach((sc) => c.header("set-cookie", sc, { append: true }));
  return c.json({ ok: true });
});

// GET /login/qrcode → 微信 scanloginqrcode?action=getqrcode(uuid) → 返二维码 JPEG(二进制透传)
loginApp.get("/qrcode", async (c) => {
  const uuid = getUuid(c);
  if (!uuid) return c.json({ error: "no uuid cookie (call /login/session first)" }, 400);
  const res = await proxyMpRequest({
    method: "GET",
    endpoint: SCANLOGINQRCODE,
    query: { action: "getqrcode", random: Date.now() },
    cookie: `uuid=${uuid}`,
  });
  // 透传微信 content-type(微信返 JPEG)+ 二进制 body(ArrayBuffer,不损坏)
  c.header("content-type", res.headers.get("content-type") ?? "image/jpeg");
  return c.body(res.body);
});

// GET /login/scan → 微信 scanloginqrcode?action=ask(uuid) → 返 {status}(0待扫/1确认/2,3过期/4,6已扫未确认)
loginApp.get("/scan", async (c) => {
  const uuid = getUuid(c);
  if (!uuid) return c.json({ error: "no uuid cookie" }, 400);
  const res = await proxyMpRequest({
    method: "GET",
    endpoint: SCANLOGINQRCODE,
    query: { action: "ask", token: "", lang: "zh_CN", f: "json", ajax: 1 },
    cookie: `uuid=${uuid}`,
  });
  // 透传微信 JSON 二进制,client fetch .json() 解
  c.header("content-type", "application/json");
  return c.body(res.body);
});

// POST /login/bizlogin → 微信 bizlogin?action=login(uuid) → 存 cookieVault + 返 authKey
loginApp.post("/bizlogin", async (c) => {
  const uuid = getUuid(c);
  if (!uuid) return c.json({ error: "no uuid cookie" }, 400);
  try {
    const res = await proxyMpRequest({
      method: "POST",
      endpoint: BIZLOGIN,
      query: { action: "login" },
      body: {
        userlang: "zh_CN",
        redirect_url: "",
        cookie_forbidden: 0,
        cookie_cleaned: 0,
        plugin_used: 0,
        login_type: 3,
        token: "",
        lang: "zh_CN",
        f: "json",
        ajax: 1,
      },
      cookie: `uuid=${uuid}`,
      action: "login",
    });
    if (!res.authKey) return c.json({ error: "login failed: no authKey (not scanned yet?)" }, 502);
    res.setCookies.forEach((sc) => c.header("set-cookie", sc, { append: true }));
    return c.json({ authKey: res.authKey });
  } catch (err) {
    return c.json({ error: "bizlogin failed", message: (err as Error).message }, 502);
  }
});
