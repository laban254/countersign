# Countersign production image.
#
# Built off-box (the AWS host has ~1 GB RAM) and shipped with `docker save | ssh ... docker load`.
# Runs the TypeScript server through tsx and serves the prebuilt frontend from /app/dist.

FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/prisma-generate.mjs scripts/prisma-generate.mjs
COPY prisma prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=160
COPY package.json package-lock.json ./
COPY scripts/prisma-generate.mjs scripts/prisma-generate.mjs
COPY prisma prisma
# The Prisma client is generated in the build stage; the CLI is a devDependency and not shipped.
# Drop the Prisma CLI and its dependencies: only the generated client is needed at runtime.
RUN npm ci --omit=dev --omit=peer --ignore-scripts && npm cache clean --force \
 && rm -rf node_modules/prisma node_modules/effect node_modules/typescript node_modules/fast-check \
    node_modules/@prisma/engines node_modules/@prisma/config node_modules/@prisma/fetch-engine \
    node_modules/@prisma/get-platform node_modules/@prisma/debug node_modules/@prisma/engines-version
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY server.ts tsconfig.json openapi.yaml ./
COPY src src
COPY --from=build /app/dist dist
USER node
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server.ts"]
