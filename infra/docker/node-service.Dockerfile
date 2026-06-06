FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.package.json vitest.config.ts ./
COPY packages ./packages
COPY services ./services
COPY agents ./agents
COPY mcp-servers ./mcp-servers
COPY apps ./apps
COPY tests ./tests

RUN pnpm install --frozen-lockfile=false

CMD ["pnpm", "build"]
