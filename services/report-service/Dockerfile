FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install --legacy-peer-deps
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
RUN apk upgrade --no-cache
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER node
ENV PORT=4009
EXPOSE 4009
CMD ["node", "dist/index.js"]
