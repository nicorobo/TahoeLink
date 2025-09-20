FROM oven/bun:latest

WORKDIR /api

COPY package.json ./
COPY bun.lock ./

RUN bun install

COPY . ./

EXPOSE 3000

CMD ["bun", "--watch", "src/main.ts"]