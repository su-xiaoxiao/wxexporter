import { defineCommand } from "citty";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadProgress, saveProgress, type Progress } from "./progress.js";

/** 文件名 sanitize:去 Windows 非法字符(复用原项目 filterInvalidFilenameChars 思路)。 */
function sanitizeFilename(title: string): string {
  return (title || "untitled").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 120) || "untitled";
}

/** 手写信号量限流并发(避免拉 p-limit 依赖)。 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

interface ArticleListItem {
  aid: string;
  title: string;
  link: string;
}

/**
 * `wxexport export <fakeid>` — 批量导出公众号文章为纯 Markdown。
 * 列文章(/mp/articles 分页)→ 信号量并发抓(/article,服务 FetchCache 去重)→
 * 落盘纯 MD(--out-dir,不加 frontmatter/双链)→ 进度 + 断点续传 + 中途失效检测。
 */
export default defineCommand({
  meta: { name: "export", description: "Batch export a WeChat account's articles as Markdown" },
  args: {
    fakeid: { type: "positional", description: "公众号 fakeid(用 wxexport search 查)" },
    max: { type: "string", description: "最多导出多少篇(默认全部)", default: "" },
    concurrency: { type: "string", description: "并发数(默认 3,防风控)", default: "3" },
    outDir: { type: "string", description: "输出目录(默认 ./<fakeid>)", default: "" },
    resume: { type: "boolean", description: "断点续传,跳过已抓", default: false },
  },
  async run({ args }) {
    const cfg = loadConfig();
    if (!cfg.authKey) {
      console.error("error: not logged in. Run: wxexport login");
      process.exit(1);
    }
    const fakeid = args.fakeid as string;
    const max = args.max ? Number(args.max) : Infinity;
    const concurrency = Number(args.concurrency) || 3;
    const outDir = (args.outDir as string) || `./${fakeid}`;
    const resume = args.resume as boolean;

    // 1. 列文章(分页)
    console.error(`列出 ${fakeid} 的文章...`);
    const all: ArticleListItem[] = [];
    const count = 20;
    let begin = 0;
    let total = 0;
    while (true) {
      const res = await fetch(
        `${cfg.baseUrl}/mp/articles?fakeid=${encodeURIComponent(fakeid)}&begin=${begin}&count=${count}`,
        { headers: { "X-Auth-Key": cfg.authKey } },
      );
      if (res.status === 401) {
        console.error("error: 登录态过期,重新 wxexport login 后 --resume 继续");
        process.exit(2);
      }
      const body = (await res.json()) as {
        total: number;
        articles: ArticleListItem[];
        error?: string;
        status?: string;
      };
      if (!res.ok || body.status === "expired") {
        console.error("error: 登录态过期或接口错误:", body.error ?? body);
        process.exit(2);
      }
      total = body.total;
      all.push(...body.articles);
      begin += count;
      if (all.length >= total || all.length >= max) break;
      if (body.articles.length === 0) break;
    }
    const toFetch = all.slice(0, Math.min(max, all.length));
    console.error(`共 ${total} 篇,本次抓 ${toFetch.length} 篇(并发 ${concurrency})`);

    // 2. 断点续传:加载已抓
    let progress: Progress = loadProgress(fakeid) ?? { fakeid, total, fetched: [] };
    progress.total = total;
    const fetchedSet = new Set(progress.fetched);
    const pending = resume ? toFetch.filter((a) => !fetchedSet.has(a.link)) : toFetch;

    if (pending.length === 0) {
      console.error(`全部已抓过(${progress.fetched.length}/${total}),无新增。`);
      saveProgress(progress);
      return;
    }

    // 3. 落盘目录
    await mkdir(outDir, { recursive: true });

    // 4. 并发抓(/article 公开,不需 authKey;但带上无害)
    let done = 0;
    let expired = false;
    await mapLimit(pending, concurrency, async (a) => {
      if (expired) return;
      try {
        const r = await fetch(`${cfg.baseUrl}/article?url=${encodeURIComponent(a.link)}`, {
          method: "POST",
          headers: { "X-Auth-Key": cfg.authKey! },
        });
        if (r.status === 401) {
          expired = true;
          return;
        }
        const art = (await r.json()) as { markdown?: string; error?: string };
        if (!r.ok || !art.markdown) {
          console.error(`  ✗ ${a.title}: ${art.error ?? r.status}`);
          return;
        }
        const file = path.join(outDir, `${sanitizeFilename(a.title)}.md`);
        await writeFile(file, art.markdown, "utf8");
        done++;
        progress.fetched.push(a.link);
        fetchedSet.add(a.link);
        console.error(`  ✓ [${done}/${pending.length}] ${a.title}`);
      } catch (e) {
        console.error(`  ✗ ${a.title}: ${(e as Error).message}`);
      }
    });

    // 5. 存进度(断点续传)
    saveProgress(progress);

    if (expired) {
      console.error(`\n登录态中途过期,已抓 ${done} 篇,进度已存。重新 wxexport login 后 --resume 继续。`);
      process.exit(2);
    }
    console.error(`\n完成:抓 ${done} 篇 → ${outDir}/ (累计 ${progress.fetched.length}/${total})`);
  },
});
