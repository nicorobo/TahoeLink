FROM oven/bun:latest

WORKDIR /app

COPY ./package.json ./bun.lock ./
COPY ./packages/api ./packages/api
COPY ./packages/shared ./packages/shared

RUN bun install --filter "api"

WORKDIR /app/packages/api

EXPOSE 3000

CMD ["bun", "--watch", "src/main.ts"]