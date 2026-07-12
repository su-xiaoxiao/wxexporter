import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock proxyMpRequest (the mp.weixin.qq.com proxy). decodeMpBody stays real —
// it just TextDecoder.decode()s the ArrayBuffer we fake. cookieVault stays real
// (temp SQLite DB), so we inject a known authKey beforeAll.
vi.mock("../src/auth/proxyMpRequest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/proxyMpRequest.js")>();
  return { ...actual, proxyMpRequest: vi.fn() };
});

const { proxyMpRequest } = await import("../src/auth/proxyMpRequest.js");
const { cookieVault } = await import("../src/auth/CookieVault.js");
const { LocalFacade } = await import("../src/facade/LocalFacade.js");

const TMP_DB = path.join(os.tmpdir(), `wxexport-facade-${process.pid}.db`);
beforeAll(() => {
  process.env.WXEXPORT_DB = TMP_DB;
  cookieVault.setCookie("k1", "tok1", ["a=b"]);
});
afterAll(() => {
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try {
      rmSync(f);
    } catch {
      // ignore
    }
  }
});

function enc(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer;
}
function mpResult(body: string) {
  return { status: 200, headers: new Headers(), body: enc(body), setCookies: [] };
}
function makeArticle(title: string, link: string) {
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
function makePublishPage(articles: ReturnType<typeof makeArticle>[]) {
  return JSON.stringify({
    featured_count: articles.length,
    masssend_count: 0,
    publish_count: articles.length,
    total_count: articles.length,
    publish_list: articles.map((a) => ({
      publish_type: 1,
      publish_info: JSON.stringify({ type: 1, msgid: "m", appmsgex: [a] }),
    })),
  });
}

// LocalFacade takes an ArticleFetcher, but list/search/check don't touch it,
// so an empty object suffices (only fetchArticle uses it).
const facade = new LocalFacade({} as never);

describe("LocalFacade list/search/check (login-gated, M3 下沉)", () => {
  it("listArticles ok → {total, articles}", async () => {
    const pp = makePublishPage([makeArticle("T1", "L1"), makeArticle("T2", "L2")]);
    proxyMpRequest.mockResolvedValue(
      mpResult(JSON.stringify({ base_resp: { ret: 0 }, publish_page: pp })),
    );
    const r = await facade.listArticles("k1", "fake", 0, 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total).toBe(2);
      expect(r.data.articles[0]?.title).toBe("T1");
      expect(r.data.articles[1]?.link).toBe("L2");
    }
  });

  it("listArticles expired (ret≠0) → ok:false expired:true ret", async () => {
    proxyMpRequest.mockResolvedValue(
      mpResult(JSON.stringify({ base_resp: { ret: 200003, err_msg: "expired" }, publish_page: "" })),
    );
    const r = await facade.listArticles("k1", "fake", 0, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.expired).toBe(true);
      expect(r.ret).toBe(200003);
    }
  });

  it("listArticles unknown authKey → expired, no proxyMpRequest call", async () => {
    (proxyMpRequest as unknown as { mockClear: () => void }).mockClear();
    const r = await facade.listArticles("no-such-key", "fake", 0, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.expired).toBe(true);
    expect(proxyMpRequest).not.toHaveBeenCalled();
  });

  it("listArticles non-JSON body → ok:false expired:false raw", async () => {
    proxyMpRequest.mockResolvedValue(mpResult("not json"));
    const r = await facade.listArticles("k1", "fake", 0, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.expired).toBe(false);
      expect(r.raw).toContain("not json");
    }
  });

  it("searchBiz ok → {total, list}", async () => {
    proxyMpRequest.mockResolvedValue(
      mpResult(
        JSON.stringify({
          base_resp: { ret: 0 },
          total: 1,
          list: [
            { alias: "", fakeid: "fid", nickname: "NN", round_head_img: "", service_type: 0, signature: "sig" },
          ],
        }),
      ),
    );
    const r = await facade.searchBiz("k1", "人月", 0, 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total).toBe(1);
      expect(r.data.list[0]?.nickname).toBe("NN");
      expect(r.data.list[0]?.fakeid).toBe("fid");
    }
  });

  it("checkLogin ret=0 → ok", async () => {
    proxyMpRequest.mockResolvedValue(
      mpResult(JSON.stringify({ base_resp: { ret: 0 }, publish_page: "" })),
    );
    const r = await facade.checkLogin("k1");
    expect(r.ok).toBe(true);
  });

  it("checkLogin ret≠0 → expired", async () => {
    proxyMpRequest.mockResolvedValue(
      mpResult(JSON.stringify({ base_resp: { ret: 200003 }, publish_page: "" })),
    );
    const r = await facade.checkLogin("k1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.expired).toBe(true);
  });
});
