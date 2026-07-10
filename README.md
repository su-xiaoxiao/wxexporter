# wxexporter

WeChat 公众号文章 → 纯 Markdown 能力服务。从 `wechat-article-exporter` 抽核心工作流,做成独立 TS 服务,跑在服务器,CLI / agent(MCP)调用,产纯 MD 供编排 agent 落 Obsidian vault。

工具是纯能力层:不碰 git、不做 vault 编排(frontmatter/双链/目录)、不持业务态。编排归其他 agent。

## 架构

```
入口: Hono HTTP  /  CLI (citty)  /  [MCP — M3]
          │              │
          ▼              ▼
能力: core facade (ArticleFetcher 接口 → ScraplingFetcher)
        │ spawn (execa, 超时/stderr 捕获)
        ▼
抓取: scrapling_fetch.py (Python 子进程, 直连微信文章页 → {title,cover,markdown})
```

## M1 范围

单篇公开文章跑通 + 服务化 + 运维页 `/status`。登录/批量/MCP/多格式 在 M2/M3。

## 开发

```bash
pnpm install          # TS 依赖
uv sync               # Python venv (scrapling + html2text)
pnpm dev              # 起 Hono 服务 localhost:3000
pnpm cli article "https://mp.weixin.qq.com/s/xxx"   # CLI 抓单篇 → stdout MD
pnpm test
```

## 设计文档

M1 实现计划 + eng review 报告:`~/.claude/plans/graceful-bubbling-falcon.md`

## 部署

M1 后定 Docker 双运行时打包(Node + Python + scrapling)。见 `DEPLOY.md`。
