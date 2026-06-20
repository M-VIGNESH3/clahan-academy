# Stage 1: Build the React application
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY vite.config.ts ./
COPY index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# Stage 2: Serve the application using an unprivileged Nginx image
FROM nginxinc/nginx-unprivileged:1.25-alpine AS runner

# Upgrade OS packages to address CVEs in base image
USER root
RUN apk upgrade --no-cache
USER 101

# Copy build files to Nginx public folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
