import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (!_db) {
    // 读 env 在 db() 首次调用时(运行时),不顶层,这样测试 beforeAll 设 env 才生效。
    const dbPath = process.env.WXEXPORT_CACHE_DB ?? path.resolve(__dirname, "../../.data/cache.db");
    mkdirSync(path.dirname(dbPath), { recursive: true });
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.exec(`CREATE TABLE IF NOT EXISTS articles (
      url TEXT PRIMARY KEY,
      title TEXT,
      cover TEXT,
      markdown TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    )`);
  }
  return _db;
}

export interface CachedArticle {
  url: string;
  title: string;
  cover: string;
  markdown: string;
  fetched_at: number;
}

/**
 * FetchCache — 服务端,键=文章 URL,无 TTL(eng review A8/#5)。
 * `force` 参数绕过缓存重抓。多端共享(公司抓过个人不重抓)。
 */
export function getCached(url: string): CachedArticle | null {
  const row = db()
    .prepare(`SELECT url, title, cover, markdown, fetched_at FROM articles WHERE url = ?`)
    .get(url) as CachedArticle | undefined;
  return row ?? null;
}

export function setCached(a: { url: string; title: string; cover: string; markdown: string }): void {
  db()
    .prepare(`INSERT OR REPLACE INTO articles (url, title, cover, markdown, fetched_at) VALUES (?, ?, ?, ?, ?)`)
    .run(a.url, a.title, a.cover, a.markdown, Date.now());
}
