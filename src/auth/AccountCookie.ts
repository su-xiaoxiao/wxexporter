// AccountCookie + cookie parsing,搬自 wechat-article-exporter/server/utils/CookieStore.ts:8-107。
// 纯 TS,无框架耦合(去 H3Event import)。逻辑零改动,只搬 + 加类型本地化。

/** 一条 set-cookie 记录的解析结果(name/value/Expires/Path 等)。 */
export type CookieEntity = Record<string, string | number>;

/** CookieVault 持久化格式(token + parsed cookies)。 */
export interface CookieKVValue {
  token: string;
  cookies: CookieEntity[];
}

/** 一个公众号登录后拿到的 set-cookie 解析结果(原项目 AccountCookie 类)。 */
export class AccountCookie {
  private readonly _token: string;
  private _cookie: CookieEntity[];

  /** @param token 从 redirect_url 提取的微信 token
   *  @param cookies response.headers.getSetCookie() 的原始字符串数组 */
  constructor(token: string, cookies: string[]) {
    this._token = token;
    this._cookie = AccountCookie.parse(cookies);
  }

  static create(token: string, cookies: CookieEntity[]): AccountCookie {
    const value = new AccountCookie(token, []);
    value._cookie = cookies;
    return value;
  }

  /** 序列化为 Cookie 请求头字符串(name=value; name=value)。 */
  toString(): string {
    return this.stringify(this._cookie);
  }

  toJSON(): CookieKVValue {
    return { token: this._token, cookies: this._cookie };
  }

  get(name: string): CookieEntity | undefined {
    return this._cookie.find((c) => c.name === name);
  }

  get token(): string {
    return this._token;
  }

  /** M2 不主动判过期(无 TTL),靠 checkLogin 在请求时检测微信侧失效(eng review A3)。 */
  get isExpired(): boolean {
    return false;
  }

  /** 解析 Set-Cookie 字符串数组为 CookieEntity[](去重 by name,处理 Expires 时间戳)。 */
  static parse(cookies: string[]): CookieEntity[] {
    const cookieMap = new Map<string, CookieEntity>();
    for (const cookie of cookies) {
      const cookieObj: CookieEntity = {};
      const parts = cookie.split(";").map((s) => s.trim());
      const [nameValue] = parts;
      if (!nameValue) continue;
      const [name, ...valueParts] = nameValue.split("=");
      const cookieName = (name ?? "").trim();
      if (!cookieName) continue;
      cookieObj.name = cookieName;
      cookieObj.value = valueParts.join("=").trim();
      for (const part of parts.slice(1)) {
        const [key, ...vp] = part.split("=");
        const value = vp.join("=").trim();
        if (!key) continue;
        const keyLower = key.toLowerCase();
        cookieObj[keyLower] = value || "true";
        if (keyLower === "expires" && value) {
          try {
            const ts = Date.parse(value);
            if (!isNaN(ts)) cookieObj.expires_timestamp = ts;
          } catch {
            // 日期解析失败忽略
          }
        }
      }
      if (cookieObj.name) cookieMap.set(cookieName, cookieObj);
    }
    return Array.from(cookieMap.values());
  }

  private stringify(parsed: CookieEntity[]): string {
    return parsed
      .filter((c) => c.value && c.value !== "EXPIRED")
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }
}

/** 从 response 的 set-cookie 取指定 name 的 value(原项目 getCookieFromResponse,直接搬)。 */
export function getCookieFromResponse(name: string, response: Response): string | null {
  const cookies = AccountCookie.parse(response.headers.getSetCookie());
  const target = cookies.find((c) => c.name === name);
  return target ? (target.value as string) : null;
}
