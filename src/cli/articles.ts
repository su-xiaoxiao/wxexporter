import { defineCommand } from "citty";
import { loadConfig } from "./config.js";

/** `wxexport articles <fakeid>` — 按公众号列已发布文章(需先 login)。 */
export default defineCommand({
  meta: { name: "articles", description: "List published articles of a WeChat account" },
  args: {
    fakeid: { type: "positional", description: "公众号 fakeid(用 wxexport search 查)" },
    begin: { type: "string", description: "offset (default 0)", default: "0" },
    count: { type: "string", description: "page size (default 5)", default: "5" },
  },
  async run({ args }) {
    const cfg = loadConfig();
    if (!cfg.authKey) {
      console.error("error: not logged in. Run: wxexport login");
      process.exit(1);
    }
    const url = `${cfg.baseUrl}/mp/articles?fakeid=${encodeURIComponent(args.fakeid as string)}&begin=${args.begin}&count=${args.count}`;
    const res = await fetch(url, { headers: { "X-Auth-Key": cfg.authKey } });
    const body = await res.json() as { total?: number; articles?: { aid: string; title: string; link: string }[]; error?: string };
    if (!res.ok) {
      console.error(`error (${res.status}):`, body.error ?? body);
      process.exit(1);
    }
    const articles = body.articles ?? [];
    console.log(`total: ${body.total}  (showing ${articles.length})`);
    for (const a of articles) {
      console.log(`  ${a.aid}  ${a.title}`);
      console.log(`    ${a.link}`);
    }
  },
});
