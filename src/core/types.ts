/**
 * Article — the unit this service produces. Pure content + provenance, no
 * vault/git/orchestration fields (those are the编排 agent's job).
 */
export interface Article {
  title: string;
  /** The fetched article URL (mp.weixin.qq.com/s/...). */
  url: string;
  /** Cover image URL, may be empty string if none found. */
  cover: string;
  /** Article body as Markdown (html2text output, not truncated by default). */
  markdown: string;
}
