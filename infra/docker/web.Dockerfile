# Multi-stage Dockerfile for a Next.js app (web-customer | web-admin | web-machine).
# Pass the workspace via build arg APP, built from the monorepo root context:
#   docker build -f infra/docker/web.Dockerfile --build-arg APP=web-customer -t printkaro-web-customer .

# ---------- base ----------
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------- deps + build ----------
FROM base AS build
ARG APP
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc turbo.json tsconfig.base.json ./
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @print-karo/types build \
  && pnpm --filter "@print-karo/${APP}" build

# ---------- runtime ----------
FROM base AS runtime
ARG APP
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy the standalone-friendly build output.
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/public ./public
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
CMD ["pnpm", "start"]
