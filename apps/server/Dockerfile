# Mycelia backend (@mycelia/server) — Fastify API + renewal daemon.
# Build context is the REPO ROOT (pnpm workspace): core is consumed as
# TypeScript source via tsx, so there is no tsc build step — we just install
# the workspace and run `tsx src/index.ts`.
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

# Runtime config. PORT/DB_PATH also pinned by compose; data/ is a mounted volume.
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/mycelia.sqlite

EXPOSE 8787

# `start` = tsx src/index.ts; binds 0.0.0.0:8787 and starts the daemon.
CMD ["pnpm", "--filter", "@mycelia/server", "start"]
