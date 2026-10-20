FROM node:24

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build
RUN mkdir -p /data

ENV NODE_ENV=production

EXPOSE 3000

CMD npx prisma migrate deploy --schema backend/prisma/schema.prisma && \
    node backend/dist/seed.cjs && \
    node backend/dist/index.cjs
