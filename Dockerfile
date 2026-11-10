# KinVault — production image
#
#   docker build -t kinvault .
#   docker run --rm -p 3000:3000 --env-file .env.production kinvault
#
# The build runs on Bun; the runtime is plain Node 22, matching Nitro's output.
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
