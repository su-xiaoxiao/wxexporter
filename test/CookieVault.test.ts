import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { cookieVault } from "../src/auth/CookieVault.js";

// 用临时 DB,不污染项目 .data/。CookieVault.db() 首次调用读 WXEXPORT_DB。
const TMP_DB = path.join(os.tmpdir(), `wxexport-test-${process.pid}.db`);
beforeAll(() => {
  process.env.WXEXPORT_DB = TMP_DB;
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

describe("CookieVault (SQLite, no TTL)", () => {
  it("setCookie → getCookie/getToken", () => {
    cookieVault.setCookie("k1", "tok1", ["name1=val1; Path=/", "name2=val2; Path=/"]);
    expect(cookieVault.getToken("k1")).toBe("tok1");
    const cookie = cookieVault.getCookie("k1");
    expect(cookie).toContain("name1=val1");
    expect(cookie).toContain("name2=val2");
  });

  it("unknown authKey → null", () => {
    expect(cookieVault.getToken("does-not-exist")).toBeNull();
    expect(cookieVault.getCookie("does-not-exist")).toBeNull();
  });

  it("removeCookie deletes", () => {
    cookieVault.setCookie("k2", "tok2", ["a=b"]);
    expect(cookieVault.getToken("k2")).toBe("tok2");
    cookieVault.removeCookie("k2");
    expect(cookieVault.getToken("k2")).toBeNull();
  });

  it("setCookie overwrites (no TTL, persist until overwritten)", () => {
    cookieVault.setCookie("k3", "old", ["a=1"]);
    cookieVault.setCookie("k3", "new", ["a=2"]);
    expect(cookieVault.getToken("k3")).toBe("new");
    expect(cookieVault.getCookie("k3")).toContain("a=2");
  });
});
