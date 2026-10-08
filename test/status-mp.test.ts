import { describe, expect, it, vi } from "vitest";
import { statusApp } from "../src/server/routes/status.js";
import { mpApp } from "../src/server/routes/mp.js";
import type { Facade } from "../src/facade/Facade.js";

describe("operational page and mp errors", () => {
  it("serves HTML to browsers while preserving JSON health checks", async () => {
    const json = await statusApp.request("/");
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(await json.json()).toHaveProperty("uptime_s");
    const html = await statusApp.request("/", {
      headers: { accept: "text/html" },
    });
    expect(html.headers.get("content-type")).toContain("text/html");
    const content = await html.text();
    expect(content).toContain("公众号采集 · 运行状态");
    expect(content).toContain("td.textContent=value");
    expect(
      (
        await statusApp.request("/json", { headers: { accept: "text/html" } })
      ).headers.get("content-type"),
    ).toContain("application/json");
  });
  it("maps frequency control consistently to 429, including login checks", async () => {
    const result = {
      ok: false,
      expired: false,
      ret: 200013,
      error: "freq control",
    };
    const facade = {
      listArticles: vi.fn().mockResolvedValue(result),
      searchBiz: vi.fn().mockResolvedValue(result),
      checkLogin: vi.fn().mockResolvedValue(result),
    } as unknown as Facade;
    const app = mpApp(facade);
    for (const path of [
      "/articles?fakeid=example",
      "/search?query=example",
      "/check",
    ]) {
      const response = await app.request(path, {
        headers: { "X-Auth-Key": "test-secret" },
      });
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({
        status: "restricted",
        base_resp: { ret: 200013 },
      });
    }
    const status = await (await statusApp.request("/json")).text();
    expect(status).toContain("200013");
    expect(status).not.toContain("test-secret");
    expect(status).not.toContain("fakeid");
  });
  it("keeps real expiry at 401 and non-JSON failures at 502", async () => {
    const checkLogin = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, expired: true, ret: 200003 })
      .mockResolvedValueOnce({
        ok: false,
        expired: false,
        error: "wechat returned non-JSON",
        raw: "private upstream response",
      });
    const app = mpApp({ checkLogin } as unknown as Facade);
    const headers = { "X-Auth-Key": "k" };
    expect((await app.request("/check", { headers })).status).toBe(401);
    const error = await app.request("/check", { headers });
    expect(error.status).toBe(502);
    expect(await error.text()).not.toContain("private upstream response");
  });
});
