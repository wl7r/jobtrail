FROM docker.io/kaylaehman/jobtrail-backend@sha256:8625198e72fec0f7e2d28bf1d759d65e5eb7ebbf9dbe89a0b91dfb90c25cb026 AS builder
WORKDIR /frontend
ENV NODE_ENV=development
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm test

FROM docker.io/kaylaehman/jobtrail-frontend@sha256:c1b33960a690d8beb9a8ae0e9ace17b47d9fd05513805030ff18fd190e00e055
COPY --from=builder /frontend/dist /usr/share/nginx/html
