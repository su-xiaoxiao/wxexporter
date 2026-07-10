import { describe, it, expect } from "vitest";
import { parseArticles, type AppMsgEx } from "../src/server/wxTypes.js";

function makeAppMsgEx(title: string, link: string): AppMsgEx {
  return {
    aid: "a1",
    appmsgid: 0,
    author_name: "",
    cover: "",
    create_time: 0,
    digest: "",
    is_deleted: false,
    item_show_type: 0,
    itemidx: 0,
    link,
    title,
    update_time: 0,
  };
}

/** 模拟微信 appmsgpublish 响应(publish_page 和 publish_info 都是 JSON 字符串,嵌套)。 */
function makeResponse(articles: AppMsgEx[]) {
  const publish_list = articles.map((a) => ({
    publish_type: 1,
    publish_info: JSON.stringify({ type: 1, msgid: "m1", appmsgex: [a] }),
  }));
  return {
    base_resp: { ret: 0 },
    publish_page: JSON.stringify({
      featured_count: articles.length,
      masssend_count: 0,
      publish_count: articles.length,
      publish_list,
      total_count: articles.length,
    }),
  };
}

describe("parseArticles (publish_page 二次 parse)", () => {
  it("解析嵌套 JSON 字符串 → AppMsgEx[]", () => {
    const resp = makeResponse([makeAppMsgEx("T1", "L1"), makeAppMsgEx("T2", "L2")]);
    const { total, articles } = parseArticles(resp.publish_page);
    expect(total).toBe(2);
    expect(articles).toHaveLength(2);
    expect(articles[0]?.title).toBe("T1");
    expect(articles[1]?.link).toBe("L2");
  });

  it("跳过空 publish_info 项", () => {
    const publish_page = JSON.stringify({
      featured_count: 0,
      masssend_count: 0,
      publish_count: 1,
      total_count: 1,
      publish_list: [{ publish_type: 1, publish_info: "" }],
    });
    const { articles } = parseArticles(publish_page);
    expect(articles).toHaveLength(0);
  });
});
