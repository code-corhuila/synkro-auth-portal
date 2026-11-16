# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_BASE_PATH=/remotes/auth/
ARG VITE_SHELL_ENTRY_URL=http://localhost:5173/assets/remoteEntry.js
ENV VITE_BASE_PATH=$VITE_BASE_PATH VITE_SHELL_ENTRY_URL=$VITE_SHELL_ENTRY_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run check:production-build
FROM nginx:1.30.6-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a
RUN apk upgrade --no-cache \
    && apk del nginx-module-xslt nginx-module-njs nginx-module-image-filter nginx-module-geoip nginx-module-acme
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
