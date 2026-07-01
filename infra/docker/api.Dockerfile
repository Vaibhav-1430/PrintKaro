# Multi-stage Dockerfile for the NestJS API (apps/api).
# Built from the monorepo root context:
#   docker build -f infra/docker/api.Dockerfile -t printkaro-api .

# ---------- base ----------
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------- deps + build ----------
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/config-tsconfig/package.json packages/config-tsconfig/package.json
COPY packages/config-eslint/package.json packages/config-eslint/package.json
RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm --filter @print-karo/database db:generate \
  && pnpm --filter @print-karo/types build \
  && pnpm --filter @print-karo/api build \
  && pnpm --filter @print-karo/api --prod deploy /out

# ---------- runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=build --chown=nestjs:nodejs /out/dist ./dist
COPY --from=build --chown=nestjs:nodejs /out/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/packages/database/prisma ./prisma

USER nestjs
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- https://printkaro-b9r0.onrender.com/health || exit 1

CMD ["node", "dist/main.js"]
