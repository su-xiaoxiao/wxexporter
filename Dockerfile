FROM node:22-bookworm-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.18 /uv /uvx /usr/local/bin/
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.11.0
WORKDIR /app
ENV CI=true UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --python /usr/bin/python3
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM build AS test
COPY test ./test
COPY vitest.config.ts ./
RUN pnpm test

FROM build AS production-dependencies
RUN pnpm prune --prod

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/uv /usr/local/bin/uvx /usr/local/bin/
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/.venv ./.venv
COPY pyproject.toml uv.lock ./
COPY fetcher ./fetcher
RUN mkdir /app/.data && chown -R node:node /app && chmod 700 /app/.data
USER node
ENV NODE_ENV=production PORT=3000 UV_NO_SYNC=1 UV_PYTHON_DOWNLOADS=never PYTHONDONTWRITEBYTECODE=1 WXEXPORT_DB=/app/.data/cookies.db WXEXPORT_CACHE_DB=/app/.data/cache.db
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/app.js"]
