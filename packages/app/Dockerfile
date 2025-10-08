FROM oven/bun:latest

WORKDIR /app

COPY ./package.json ./bun.lock ./
COPY ./packages/app ./packages/app
COPY ./packages/shared ./packages/shared

RUN bun install --filter "app"

WORKDIR /app/packages/app

EXPOSE 5173

CMD ["bun", "run", "dev"]