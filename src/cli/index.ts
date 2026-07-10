import { defineCommand, runMain } from "citty";
import { writeFile } from "node:fs/promises";
import { LocalFacade } from "../facade/LocalFacade.js";
import { ScraplingFetcher, ArticleFetchError } from "../core/ScraplingFetcher.js";

const articleCommand = defineCommand({
  meta: { name: "article", description: "Fetch a WeChat article as Markdown" },
  args: {
    url: { type: "positional", description: "Article URL (mp.weixin.qq.com/s/...)" },
    out: {
      type: "string",
      description: "Write MD to this file instead of stdout (pure MD, no frontmatter/links)",
    },
    timeout: { type: "string", description: "Fetch timeout in ms (default 60000)" },
  },
  async run({ args }) {
    const url = args.url as string | undefined;
    if (!url) {
      console.error("error: url is required");
      process.exit(1);
    }
    const timeoutMs = args.timeout ? Number(args.timeout) : undefined;
    const facade = new LocalFacade(new ScraplingFetcher({ timeoutMs }));

    try {
      const article = await facade.fetchArticle(url);
      if (args.out) {
        await writeFile(args.out, article.markdown, "utf8");
        // status goes to stderr so stdout stays clean for piping
        console.error(`wrote ${article.markdown.length} bytes to ${args.out}`);
      } else {
        process.stdout.write(article.markdown + "\n");
      }
    } catch (err) {
      if (err instanceof ArticleFetchError) {
        console.error(`error: ${err.message}`);
        process.exit(2);
      }
      throw err;
    }
  },
});

const main = defineCommand({
  meta: { name: "wxexport", description: "WeChat article → Markdown capability CLI" },
  subCommands: {
    article: articleCommand,
  },
});

runMain(main);
