import { cookieVault } from "./CookieVault.js";

// 原项目用 ~/config USER_AGENT;M2 内联(微信 UA,搬自原项目 config/index.ts:54)。
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface MpRequestOptions {
  method: "GET" | "POST";
  endpoint: string;
  query?: Record<string, string | number>;
  body?: Record<string, string | number>;
  /** 登录流程的 uuid cookie 透传(优先于 cookieVault 查询)。 */
  cookie?: string;
  /** 认证后请求:从此 authKey 查 cookieVault 注入 Cookie。 */
  authKey?: string;
  /** start_login:透传微信下发的 uuid;login:存 cookieVault + 生成 authKey。 */
  action?: "start_login" | "login";
  /** action=login 时由 caller 指定 authKey(否则内部随机生成)。 */
  authKeyOut?: string;
}

export interface MpRequestResult {
  status: number;
  headers: Headers;
  body: string;
  /** 透传给 client 的 set-cookie(login 流程:uuid / auth-key)。 */
  setCookies: string[];
  /** action=login 成功时写入 cookieVault 的 authKey。 */
  authKey?: string;
}

/**
 * 代理请求 mp.weixin.qq.com。轻改自原项目 server/utils/proxy-request.ts:14-144:
 *  - 去 H3Event / useRuntimeConfig / logRequest / logger
 *  - cookie 由 caller 传入(options.cookie 直接 / options.authKey 查 cookieVault)
 *  - cookieStore → cookieVault(单例,直接 import)
 *  - 返回结构化 MpRequestResult(caller 不需 clone Response)
 *
 * token 不在此注入:各 route handler 从 cookieVault.getToken(authKey) 拼 query params。
 */
export async function proxyMpRequest(options: MpRequestOptions): Promise<MpRequestResult> {
  const headers = new Headers({
    Referer: "https://mp.weixin.qq.com/",
    Origin: "https://mp.weixin.qq.com",
    "User-Agent": USER_AGENT,
    "Accept-Encoding": "identity",
  });

  // cookie 来源:options.cookie(登录 uuid 透传)> cookieVault.getCookie(authKey)(认证后)
  const cookie =
    options.cookie ?? (options.authKey ? cookieVault.getCookie(options.authKey) : null);
  if (cookie) headers.set("Cookie", cookie);

  let endpoint = options.endpoint;
  if (options.query) {
    endpoint += "?" + new URLSearchParams(options.query as Record<string, string>).toString();
  }
  const requestInit: RequestInit = { method: options.method, headers, redirect: "follow" };
  if (options.method === "POST" && options.body) {
    requestInit.body = new URLSearchParams(options.body as Record<string, string>).toString();
  }

  const mpResponse = await fetch(new Request(endpoint, requestInit));

  let setCookies: string[] = [];
  let authKey: string | undefined;

  if (options.action === "start_login") {
    // 透传微信下发的 uuid cookie 给 client(扫码后续请求带)
    setCookies = mpResponse.headers.getSetCookie().filter((c) => c.startsWith("uuid="));
  } else if (options.action === "login") {
    // 提取 token + 全部 set-cookie,存 cookieVault,生成 authKey 返给 client
    const text = await mpResponse.clone().text();
    let body: { redirect_url?: string };
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`bizlogin response not JSON: ${text.slice(0, 200)}`);
    }
    const redirectUrl = body.redirect_url;
    if (!redirectUrl || typeof redirectUrl !== "string") {
      throw new Error(`登录响应未含 redirect_url: ${JSON.stringify(body).slice(0, 300)}`);
    }
    const token = new URL(`http://localhost${redirectUrl}`).searchParams.get("token");
    if (!token) {
      throw new Error(`redirect_url 未含 token: ${redirectUrl}`);
    }
    authKey = options.authKeyOut ?? crypto.randomUUID().replace(/-/g, "");
    cookieVault.setCookie(authKey, token, mpResponse.headers.getSetCookie());
    setCookies = [`auth-key=${authKey}; Path=/; HttpOnly`];
  }

  const responseBody = await mpResponse.text();
  return { status: mpResponse.status, headers: mpResponse.headers, body: responseBody, setCookies, authKey };
}
