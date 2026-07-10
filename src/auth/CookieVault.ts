import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountCookie, type CookieEntity, type CookieKVValue } from "./AccountCookie.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (!_db) {
    // 读 env 在 db() 首次调用时(运行时),不顶层,这样测试 beforeAll 设 env 才生效。
    const dbPath = process.env.WXEXPORT_DB ?? path.resolve(__dirname, "../../.data/cookies.db");
    mkdirSync(path.dirname(dbPath), { recursive: true });
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.exec(`CREATE TABLE IF NOT EXISTS cookies (
      auth_key   TEXT PRIMARY KEY,
      token      TEXT NOT NULL,
      cookies_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  }
  return _db;
}

/**
 * CookieVault — 持久化 {token, cookies} per authKey in SQLite, **无 TTL**
 * (eng review A3: 存到微信侧失效为止,靠 checkLogin 在批量前校验 + 中途失效检测)。
 * AccountCookie 解析逻辑搬自原项目,无改动。
 */
export class CookieVault {
  setCookie(authKey: string, token: string, cookie: string[]): boolean {
    const account = new AccountCookie(token, cookie);
    const cookies = account.toJSON().cookies;
    const now = Date.now();
    db()
      .prepare(
        `INSERT OR REPLACE INTO cookies (auth_key, token, cookies_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(authKey, token, JSON.stringify(cookies), now, now);
    return true;
  }

  private getRaw(authKey: string): CookieKVValue | null {
    const row = db()
      .prepare(`SELECT token, cookies_json FROM cookies WHERE auth_key = ?`)
      .get(authKey) as { token: string; cookies_json: string } | undefined;
    if (!row) return null;
    return { token: row.token, cookies: JSON.parse(row.cookies_json) as CookieEntity[] };
  }

  getAccountCookie(authKey: string): AccountCookie | null {
    const raw = this.getRaw(authKey);
    return raw ? AccountCookie.create(raw.token, raw.cookies) : null;
  }

  getCookie(authKey: string): string | null {
    return this.getAccountCookie(authKey)?.toString() ?? null;
  }

  getToken(authKey: string): string | null {
    return this.getAccountCookie(authKey)?.token ?? null;
  }

  removeCookie(authKey: string): void {
    db().prepare(`DELETE FROM cookies WHERE auth_key = ?`).run(authKey);
  }
}

export const cookieVault = new CookieVault();
