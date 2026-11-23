FROM node:22-bookworm-slim AS frontend
WORKDIR /src/apps/frontend
COPY apps/frontend/package*.json ./
RUN npm ci --workspaces=false
COPY apps/frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend
WORKDIR /src/apps/backend
COPY apps/backend/package*.json ./
RUN npm ci --workspaces=false
COPY apps/backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=backend /src/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=backend /src/apps/backend/dist ./apps/backend/dist
COPY --from=frontend /src/apps/frontend/dist ./apps/frontend/dist
USER node
EXPOSE 3000
CMD ["node","apps/backend/dist/server.js"]
