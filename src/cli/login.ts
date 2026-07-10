import { defineCommand } from "citty";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { loadConfig, saveConfig } from "./config.js";

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * `wxexport login` — 扫码登录(弹网页显示二维码)。
 * 流程:session→qrcode(PNG)→ 起临时本地页显示 + open 浏览器 → 轮询 scan →
 * status=1 → bizlogin → authKey 存 client config。扫完关临时页。
 */
export default defineCommand({
  meta: { name: "login", description: "Scan QR to log in to WeChat MP (opens a browser page)" },
  async run() {
    const cfg = loadConfig();
    const sid = crypto.randomUUID();

    // 1. POST /login/session/:sid → 拿 uuid set-cookie
    const sRes = await fetch(`${cfg.baseUrl}/login/session/${sid}`, { method: "POST" });
    const uuidCookie = sRes.headers.getSetCookie?.().find((c) => c.startsWith("uuid="));
    const uuid = uuidCookie?.split("=")[1]?.split(";")[0];
    if (!uuid) {
      console.error("error: no uuid in /login/session response");
      process.exit(1);
    }

    // 2. GET /login/qrcode(uuid) → PNG
    const qRes = await fetch(`${cfg.baseUrl}/login/qrcode`, { headers: { Cookie: `uuid=${uuid}` } });
    if (!qRes.ok) {
      console.error(`error: qrcode fetch failed (${qRes.status})`);
      process.exit(1);
    }
    const png = Buffer.from(await qRes.arrayBuffer());

    // 3. 起临时本地 server 显示二维码 + open 浏览器
    const html = `<!doctype html><meta charset="utf-8"><title>wxexport login</title>
<body style="text-align:center;font-family:system-ui;padding:2rem">
<h2>用微信扫码登录</h2>
<img src="data:image/png;base64,${png.toString("base64")}" style="border:1px solid #ddd" />
<p style="color:#888">扫完此页可关闭</p></body>`;
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    const port = 3100 + Math.floor(Math.random() * 900);
    await new Promise<void>((r) => server.listen(port, r));
    const pageUrl = `http://localhost:${port}`;
    console.error(`二维码页已打开: ${pageUrl}(没自动开就用浏览器访问这个地址)`);
    openBrowser(pageUrl);

    // 4. 轮询 /login/scan 每 2s(最多 ~2 分钟)
    let status = -1;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const scRes = await fetch(`${cfg.baseUrl}/login/scan`, { headers: { Cookie: `uuid=${uuid}` } });
      const scBody = (await scRes.json()) as { status?: number };
      status = scBody.status ?? -1;
      console.error(`scan status: ${status}`);
      if (status === 1) break; // 确认登录
      if (status === 2 || status === 3) {
        console.error("二维码过期,请重跑 wxexport login");
        server.close();
        process.exit(2);
      }
    }
    if (status !== 1) {
      console.error("登录超时(2 分钟未扫码确认)");
      server.close();
      process.exit(3);
    }

    // 5. POST /login/bizlogin(uuid) → authKey
    const bRes = await fetch(`${cfg.baseUrl}/login/bizlogin`, {
      method: "POST",
      headers: { Cookie: `uuid=${uuid}` },
    });
    const bBody = (await bRes.json()) as { authKey?: string; error?: string };
    server.close();
    if (!bBody.authKey) {
      console.error("bizlogin failed:", bBody.error ?? bBody);
      process.exit(4);
    }
    saveConfig({ ...cfg, authKey: bBody.authKey });
    console.error(`登录成功,authKey 已存 ~/.wxexport/config.json`);
  },
});
