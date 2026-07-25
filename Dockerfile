FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Builds the client (dist/) and bundles the proxy (dist-server/index.js).
RUN npm run build:all

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# The proxy is a single bundled file that also serves the static client, so the
# runtime image needs only the two build outputs — no node_modules.
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist-server/index.js"]
