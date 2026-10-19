# Build with bun, run on Node (ADR-0004).
FROM oven/bun:1.3 AS build
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NUXT_MIGRATIONS_DIR=/app/migrations \
    NUXT_BLOB_DIR=/data/blobs \
    NUXT_UPLOAD_DIR=/data/uploads \
    NUXT_PREVIEW_DIR=/data/previews
COPY --from=build /src/.output ./
COPY --from=build /src/server/db/migrations ./migrations
RUN mkdir -p /data/blobs /data/uploads /data/previews && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
