# ---- Build stage ----
FROM node:22-slim AS builder
WORKDIR /app
# Prisma engines need OpenSSL; debian-slim ships without it.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

# ---- Runtime stage ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
