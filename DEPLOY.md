# 部署(M1 draft — Docker 双运行时打包 M1 后定)

## 运行时要求

- **Node.js >= 20** — 服务(Hono)+ CLI
- **Python >= 3.10** — scrapling 抓取子进程(`Fetcher.get` 默认 httpx,**不需要 chromium**;只有 `DynamicFetcher` 才要,本项目不用)
- **uv** — 管 Python venv(固定 venv,复用,避免每次 `--with` 冷启动,eng review P1 提前优化)
- **pnpm** — TS 依赖管理

## 服务端(你的服务器)

```bash
git clone <repo> wxexporter && cd wxexporter
pnpm install            # TS 依赖
uv sync                 # Python venv: scrapling + html2text(首次建 .venv,后续复用)
pnpm build              # tsc → dist/
PORT=3000 node dist/server/app.js
```

服务暴露后放统一网关后(client→服务认证由网关,不在本项目 — eng review A6)。

## 客户端(公司/个人电脑)

M1 先本地:`pnpm cli article "<url>"` 或 build 后 `node dist/cli/index.js article "<url>"`。
远程 transport(RemoteFacade)M2 实现;M2 后客户端 `wxexport article <url> --out file.md` 调远程服务。

## 验证

```bash
curl localhost:3000/status                                    # {uptime_s, recentRequests, workerStatus}
curl -X POST 'localhost:3000/article?url=https://mp.weixin.qq.com/s/xxx'
# → {"title":...,"url":...,"cover":...,"markdown":...}
```

## 待定(M1 后)

- Docker 双运行时打包(一镜像含 Node + Python + .venv)— #1 outside voice
- CLI 分发方式(native binary via `pkg`/`bun build --compile`? pnpm global?)
- scrapling 升常驻 worker pool(M2)— eng review P1
- 进程管理(systemd / pm2)
- pyproject 依赖锁(uv.lock 提交,保证服务器装版本一致)
