# wxexporter

WeChat 公众号文章 → 纯 Markdown 能力服务。从 `wechat-article-exporter` 抽核心工作流，做成独立 TS 服务，跑在服务器，**HTTP / CLI / MCP 三入口**调用，产纯 MD（或 HTML/JSON）供编排 agent 落 Obsidian vault。

**纯能力层**：不碰 git、不做 vault 编排（frontmatter/双链/目录）、不持业务态（"哪些文章抓过"归编排 agent）。登录态（cookie）+ 抓取缓存是会话/性能态，非业务态。

## 能力

| 能力 | 说明 | 登录 |
|------|------|------|
| fetch article | 单篇 mp 文章 → MD / HTML / JSON | 否（公开） |
| login | 扫码登录 mp 平台 → authKey | — |
| search biz | 搜公众号 → fakeid | 是 |
| list articles | 公众号已发文章列表 | 是 |
| batch export | 按公众号批量抓 + 断点续传（CLI） | 是 |
| check login | 登录态是否有效 | 是 |

三种入口都走同一个 `Facade`，**能力实现一次**：HTTP API / CLI / MCP。

## 架构

```
入口:   Hono HTTP  /  CLI (citty)  /  MCP (Streamable HTTP @ /mcp)
            │              │              │
            └──────────────┼──────────────┘
                           ▼
能力:    Facade (fetchArticle / listArticles / searchBiz / checkLogin)
           │                        │
           ▼                          ▼
    ScraplingFetcher            proxyMpRequest + cookieVault
   (spawn → scrapling_fetch.py)  (mp.weixin.qq.com 后台 API)
                           ▼
         cookieVault (SQLite, 无 TTL) — authKey → {token, cookies}
```

- `fetchArticle` 走 scrapling Python 子进程（直连文章页，`Fetcher.get` 默认 httpx，**不需 chromium**）
- `list/search/check` 走 mp.weixin.qq.com 后台 API（扫码登录态，cookieVault 注入 cookie）
- 三入口共享 facade 单例（MCP 嵌 Hono 同进程，eng review #8）

## 快速开始

```bash
pnpm install          # TS 依赖
uv sync               # Python venv (scrapling + html2text)
pnpm dev              # 起 Hono 服务 localhost:3000 (HTTP + MCP /mcp)
```

### CLI

```bash
wxexport login                                   # 扫码登录 → authKey 存 ~/.wxexport/config.json
wxexport search "人月"                            # 搜公众号 → fakeid
wxexport articles "MzA3NDUxMTUxOQ=="             # 列文章
wxexport article "https://mp.weixin.qq.com/s/xxx" --out a.md   # 单篇 → MD 文件
wxexport export "MzA3NDUxMTUxOQ==" --max 5       # 批量 5 篇 → ./<fakeid>/
wxexport export "MzA3..." --resume               # 断点续传（跳过已抓）
```

### HTTP API

```bash
POST /article?url=<mp-url>[&force=1][&format=md|html|json]   # 抓单篇（FetchCache 去重）
GET  /mp/search?query=<kw>&count=5                            # 搜公众号（需 X-Auth-Key）
GET  /mp/articles?fakeid=<id>&begin=0&count=5                 # 列文章（需 X-Auth-Key）
GET  /mp/check                                                 # 登录态（需 X-Auth-Key）
GET  /login/session/:sid | /login/qrcode | /login/scan | POST /login/bizlogin  # 扫码登录流程
GET  /status                                                   # 运维页（uptime/recent/worker）
```

`X-Auth-Key` header 带 authKey（`login` 返回，存 `~/.wxexport/config.json`）。

### MCP（给 Claude Code 等编排 agent）

服务同进程 `/mcp` 挂 MCP server（stateless Streamable HTTP，SDK `WebStandardStreamableHTTPServerTransport`）。`.mcp.json`：

```json
{
  "mcpServers": {
    "wxexporter": { "url": "http://localhost:3000/mcp" }
  }
}
```

重启 Claude Code → 4 个 tool：

- `fetch_article(url, format?)` — 公开，不需登录
- `list_articles(fakeid, begin?, count?, authKey?)` — 列文章（登录态）
- `search_biz(query, begin?, count?, authKey?)` — 搜公众号（登录态）
- `check_login(authKey?)` — 登录态校验

`authKey` 不传则读 `~/.wxexport/config.json`（和 CLI 同源）。

### 多格式

`fetch_article` / `/article?format=` 支持：

- `md`（默认）— 纯 markdown（`/article` 返 JSON `{title,url,cover,markdown,cached}`，CLI 读 `.markdown`）
- `html` — `<!doctype html>` + title + cover + `marked(markdown)`
- `json` — 序列化 Article

不搬原项目 `Exporter.ts`（浏览器侧重导出器，依赖 Nuxt/store/FileSystemDirectoryHandle，服务端不可用）；资源本地化 / 图片下载归编排 agent（服务产内容，不产资产）。

## 设计原则

- **纯能力**：只产内容，不编排（frontmatter/双链/目录/git 归编排 agent）
- **无业务态**：cookie/缓存是会话/性能态；"哪些文章抓过"归 client 进度文件（`~/.wxexport/progress-<fakeid>.json`），服务不存
- **能力实现一次**：`Facade` 单一能力面，HTTP/CLI/MCP 都调它
- **FetchCache**（SQLite，URL 键，无 TTL，`force` 绕过）— 多端共享（公司抓过个人不重抓）
- **断点续传**（client 端 progress + `--resume`）+ **中途失效检测**（401 → 停 + 存进度 + 提示重新 login）
- **CookieVault**（SQLite，无 TTL）— 存到微信侧失效为止，靠 `checkLogin` 批量前校验 + 中途失效检测

## 开发

```bash
pnpm test              # vitest (30 tests: format/facade-list-search/mcp + 回归)
pnpm exec tsc --noEmit # 类型检查
pnpm build             # tsc → dist/
pnpm dev               # tsx watch
```

## 部署

见 `DEPLOY.md`（双运行时 Node + Python，MCP 同端口）。

## 设计文档

- M1+M2 实现 + eng review：`~/.claude/plans/graceful-bubbling-falcon.md`
- M3（MCP + 多格式）plan：`~/.claude/plans/nifty-dazzling-teapot.md`

## 路线

- ✅ M1 单篇 + 服务 + 运维页
- ✅ M2 登录 + 按公众号批量 + 断点续传
- ✅ M3 MCP adapter + 多格式（MD/HTML/JSON）
- ⏳ M4 评论/元数据（需文章侧凭证 `pass_ticket`/`key`/`uin`，scrapling 返 HTML + `extractCommentId`）
