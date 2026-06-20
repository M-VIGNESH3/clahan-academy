# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine AS runner
# Upgrade OS packages to address CVEs in Alpine base image
RUN apk upgrade --no-cache

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy build artifact from builder
COPY --from=builder /app/dist ./dist

# Run as non-root node user
USER node

ENV PORT=4004
EXPOSE 4004
CMD ["node", "dist/index.js"]
