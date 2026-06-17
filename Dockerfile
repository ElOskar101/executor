FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
COPY ecosystem.config.js ./

RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Persist generated reports outside the container filesystem.
VOLUME ["/app/reports"]

EXPOSE 3018

CMD ["node", "dist/src/server.js"]

