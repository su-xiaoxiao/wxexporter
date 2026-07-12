# 部署

## 运行时要求

- **Node.js >= 20** — 服务（Hono）+ CLI + MCP
- **Python >= 3.10** — scrapling 抓取子进程（`Fetcher.get` 默认 httpx，**不需 chromium**；只有 `DynamicFetcher` 才要，本项目不用）
- **uv** — 管 Python venv（固定 `.venv`，复用，避免每次 `--with` 冷启动）
- **pnpm** — TS 依赖管理

## 服务端

```bash
git clone <repo> wxexporter && cd wxexporter
pnpm install            # TS 依赖
uv sync                 # Python venv: scrapling + html2text（首次建 .venv，后续复用）
pnpm build              # tsc → dist/
PORT=3000 node dist/server/app.js
```

**一个端口同时是 HTTP API + MCP（`/mcp`）**。服务暴露后放统一网关后（client→服务认证由网关，不在本项目 — eng review A6）。

环境变量：

- `PORT` — HTTP + MCP 端口（默认 3000；M2 真实验证用 3004）
- `WXEXPORT_DB` — cookieVault SQLite 路径（默认 `.data/cookies.db`）
- `WXEXPORT_CACHE_DB` — FetchCache SQLite 路径（默认 `.data/cache.db`）

## MCP 接入（Claude Code）

`.mcp.json`（项目根或 `~/.claude/`）：

```json
{
  "mcpServers": {
    "wxexporter": { "url": "http://<host>:<port>/mcp" }
  }
}
```

`list_articles` / `search_biz` / `check_login` 需 authKey：服务端 `~/.wxexport/config.json` 存（`wxexport login` 后写），MCP tool 的 `authKey` 参数可覆盖。

> ⚠️ MCP 端口能访问登录态（list/search 需 authKey）。生产部署网关必须加认证，否则任何人可借你的登录态调 list/search。

## 客户端

```bash
wxexport login                                   # 扫码登录 → authKey 存 config
wxexport search "关键词"                          # 拿 fakeid
wxexport export "<fakeid>" --max 50 --concurrency 3 --out-dir ./out --resume
```

远程 transport（`RemoteFacade`）已实现：CLI 读 `~/.wxexport/config.json` 的 `baseUrl` 指远程服务。改 `baseUrl` 即切本地↔远程，调用代码不变。

## 验证

```bash
curl localhost:3000/status
curl -X POST 'localhost:3000/article?url=https://mp.weixin.qq.com/s/xxx&format=html'   # → HTML
curl localhost:3000/mp/check -H "X-Auth-Key: <authKey>"                                # → {status:"ok",ret:0}

# MCP（stateless，每请求独立）：
curl -X POST localhost:3000/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
curl -X POST localhost:3000/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'                                  # → 4 tools
```

## 待定

- Docker 双运行时镜像（一镜像含 Node + Python + .venv）— #1 outside voice
- CLI 分发（native binary via `pkg`/`bun build --compile`？pnpm global？）
- scrapling 常驻 worker pool（现 spawn-on-demand，M2 优化为固定 venv 已够）— eng review P1
- 进程管理（systemd / pm2）
- pyproject 依赖锁（`uv.lock` 提交，保证服务器装版本一致）
- 网关认证（MCP/HTTP 端口生产暴露时必须）
