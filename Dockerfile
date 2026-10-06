# Demo pública de Shiplog: repos de ejemplo generados al construir y la app en modo solo lectura.
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV SHIPLOG_ROOT=/app/.demo/repos SHIPLOG_DATA=/app/.demo/data SHIPLOG_MEMORY_DIR=/app/.demo/memory NEXT_TELEMETRY_DISABLED=1
RUN node scripts/demo.ts --no-dev && node scripts/shiplog.ts sync && pnpm build
ENV NODE_ENV=production SHIPLOG_READONLY=1
CMD ["sh", "-c", "pnpm exec next start -H 0.0.0.0 -p ${PORT:-3000}"]
