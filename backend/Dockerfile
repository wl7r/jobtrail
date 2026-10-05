FROM docker.io/kaylaehman/jobtrail-backend@sha256:8625198e72fec0f7e2d28bf1d759d65e5eb7ebbf9dbe89a0b91dfb90c25cb026 AS builder
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm test -- --runInBand

FROM docker.io/kaylaehman/jobtrail-backend@sha256:8625198e72fec0f7e2d28bf1d759d65e5eb7ebbf9dbe89a0b91dfb90c25cb026
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
