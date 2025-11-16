# Multi-stage build for production
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/

# Install dependencies
RUN npm ci

# Build backend
FROM base AS backend-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/backend ./apps/backend
COPY package.json ./

WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

# Build web
FROM base AS web-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
COPY package.json ./

WORKDIR /app/apps/web
RUN npm run build

# Production backend image
FROM base AS backend-runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 4000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=backend-builder --chown=nodejs:nodejs /app/apps/backend/dist ./dist
COPY --from=backend-builder --chown=nodejs:nodejs /app/apps/backend/node_modules ./node_modules
COPY --from=backend-builder --chown=nodejs:nodejs /app/apps/backend/package.json ./package.json
COPY --from=backend-builder --chown=nodejs:nodejs /app/apps/backend/prisma ./prisma

USER nodejs

EXPOSE 4000

CMD ["node", "dist/index.js"]

# Production web image
FROM base AS web-runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=web-builder --chown=nextjs:nodejs /app/apps/web/.next ./.next
COPY --from=web-builder --chown=nextjs:nodejs /app/apps/web/public ./public
COPY --from=web-builder --chown=nextjs:nodejs /app/apps/web/package.json ./package.json
COPY --from=web-builder --chown=nextjs:nodejs /app/apps/web/node_modules ./node_modules

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
