FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

COPY server.js ./

EXPOSE 5001-5004

ENV PORT=5001
ENV STORAGE_DIR=/app/storage

CMD ["node", "server.js"]
