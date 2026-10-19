# syntax=docker/dockerfile:1

# Three stages:
#  1. deps:    production dependencies only (no devDependencies, no install scripts)
#  2. build:   full install, then `npm run build` (typecheck, client bundle, server bundle)
#  3. runtime: Node 22 slim with just dist/, package.json and the production node_modules,
#              running as the unprivileged `node` user. Nothing else from the repo is copied.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
# Exec form, so node is PID 1 and receives SIGTERM directly (the server closes on SIGTERM).
CMD ["node", "dist/server/index.js"]
