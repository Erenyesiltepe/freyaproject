# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
ENV NODE_ENV=production
WORKDIR /app

# ---- Install dependencies (uses pnpm via Corepack) ----
FROM base AS deps
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build application ----
FROM deps AS builder
ENV NODE_ENV=production
COPY . .
RUN pnpm build

# ---- Production image ----
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable

# Install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built assets and necessary files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules/.pnpm/.modules.yaml ./node_modules/.pnpm/.modules.yaml || true

EXPOSE 3000

CMD ["pnpm", "start"]
