import { describe, it, expect } from "vitest";
import { formatArticle } from "../src/core/format.js";
import type { Article } from "../src/core/types.js";

const article: Article = {
  title: "Hello <b>",
  url: "https://mp.weixin.qq.com/s/x",
  cover: "https://img/cover.jpg",
  markdown: "# Title\n\n正文 **bold**",
};

describe("formatArticle (M3 multi-format)", () => {
  it("md → raw markdown (default)", () => {
    expect(formatArticle(article, "md")).toBe(article.markdown);
    expect(formatArticle(article)).toBe(article.markdown);
  });

  it("json → serialized Article", () => {
    const out = formatArticle(article, "json");
    expect(JSON.parse(out)).toEqual(article);
  });

  it("html → doctype + escaped title + cover + marked body", () => {
    const out = formatArticle(article, "html");
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<title>Hello &lt;b&gt;</title>");
    expect(out).toContain("<h1>Hello &lt;b&gt;</h1>");
    expect(out).toContain('<img src="https://img/cover.jpg"');
    expect(out).toContain("<h1>Title</h1>"); // marked: # Title → <h1>Title</h1>
    expect(out).toContain("<strong>bold</strong>"); // marked: **bold** → <strong>bold</strong>
  });

  it("html with no cover → no <img>", () => {
    const out = formatArticle({ ...article, cover: "" }, "html");
    expect(out).not.toContain("<img");
  });
});
