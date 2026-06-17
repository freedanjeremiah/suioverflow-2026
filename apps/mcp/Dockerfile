# Mycelia MCP server (@mycelia/mcp) — Streamable HTTP transport for hosted use.
# Build context is the REPO ROOT (pnpm workspace): core is consumed as TypeScript
# source via tsx, so there is no tsc build step — install the workspace and run
# `tsx src/http.ts`. Same shape as apps/server/Dockerfile.
FROM node:22-bookworm-slim

# better-sqlite3 is a native addon (allowBuilds in pnpm-workspace.yaml) — needs a
# toolchain at install time. ca-certificates for outbound TLS (Tatum/Walrus/Sui).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Whole workspace (node_modules/.git/media excluded via root .dockerignore).
COPY . .

# Full frozen install: pulls tsx (root devDep) + compiles better-sqlite3.
RUN pnpm install --frozen-lockfile

# Runtime config. PORT/MYCELIA_DB/MYCELIA_HOME also pinned by compose; /data is a
# mounted volume holding both the SQLite graph and the generated keystore (so the
# server identity is stable across restarts unless MYCELIA_KEY is set in env).
ENV NODE_ENV=production \
    PORT=8788 \
    MCP_PATH=/mcp \
    MYCELIA_HOME=/data \
    MYCELIA_DB=/data/memory.sqlite

EXPOSE 8788

# start:http = tsx src/http.ts; binds 0.0.0.0:8788, starts the daemon poll loop.
CMD ["pnpm", "--filter", "@mycelia/mcp", "start:http"]
