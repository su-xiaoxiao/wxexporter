import { defineCommand } from "citty";
import { loadConfig } from "./config.js";

/** `wxexport search <keyword>` — 搜公众号,拿 fakeid。 */
export default defineCommand({
  meta: { name: "search", description: "Search WeChat accounts by keyword (returns fakeid)" },
  args: {
    keyword: { type: "positional", description: "公众号关键词" },
  },
  async run({ args }) {
    const cfg = loadConfig();
    if (!cfg.authKey) {
      console.error("error: not logged in. Run: wxexport login");
      process.exit(1);
    }
    const url = `${cfg.baseUrl}/mp/search?query=${encodeURIComponent(args.keyword as string)}`;
    const res = await fetch(url, { headers: { "X-Auth-Key": cfg.authKey } });
    const body = await res.json() as { total?: number; list?: { fakeid: string; nickname: string; alias: string; signature: string }[]; error?: string };
    if (!res.ok) {
      console.error(`error (${res.status}):`, body.error ?? body);
      process.exit(1);
    }
    const list = body.list ?? [];
    console.log(`total: ${body.total}  (showing ${list.length})`);
    for (const a of list) {
      console.log(`  ${a.fakeid}  ${a.nickname}${a.alias ? `  (${a.alias})` : ""}`);
      if (a.signature) console.log(`    ${a.signature.slice(0, 80)}`);
    }
  },
});
