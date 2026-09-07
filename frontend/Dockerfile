// ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ----
FROM nginx:alpine

# envsubst is provided by busybox in the nginx alpine image
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html

# Template (gets envsubst'd at startup) + entrypoint script
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
