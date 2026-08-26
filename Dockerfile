# ==================== Stage 1: Install dependencies ====================
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ==================== Stage 2: Production image ====================
FROM node:18-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 -S therabridge && \
    adduser -S therabridge -u 1001 -G therabridge

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p uploads && chown -R therabridge:therabridge /app

USER therabridge

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
