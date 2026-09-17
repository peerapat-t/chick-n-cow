# ---------- Build the web app ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Runtime ----------
# The server has no npm dependencies; Node 24 runs the .ts files directly.
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    CARDS_DIR=/app/cards

COPY --from=build /app/dist ./dist
COPY server ./server
# Default cards. A named volume mounted here is seeded with them on first run.
COPY --chown=node:node cards ./cards
# Game sounds (sound/start.*, sound/during.*)
COPY --chown=node:node sound ./sound

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/cards > /dev/null || exit 1

CMD ["node", "server/index.ts"]
