FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Shiplog con tus repos: `docker compose up -d --build` (ver compose.yaml).
FROM base AS app
RUN SHIPLOG_ROOT=/tmp/repos SHIPLOG_DATA=/tmp/data pnpm build
# Los repos vienen montados con otro dueño; sin esto git se niega a leerlos ("dubious ownership").
RUN git config --system --add safe.directory '*'
ENV NODE_ENV=production SHIPLOG_ROOT=/repos SHIPLOG_DATA=/data
EXPOSE 3210
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3210"]

# Demo pública (Railway construye la última etapa): repos de ejemplo generados al construir, solo lectura.
FROM base AS demo
ENV SHIPLOG_ROOT=/app/.demo/repos SHIPLOG_DATA=/app/.demo/data
RUN node scripts/demo.ts --no-dev && node scripts/shiplog.ts sync && pnpm build
ENV NODE_ENV=production SHIPLOG_READONLY=1
CMD ["sh", "-c", "pnpm exec next start -H 0.0.0.0 -p ${PORT:-3000}"]
