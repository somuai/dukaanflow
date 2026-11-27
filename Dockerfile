FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY modules ./modules
RUN npm ci --no-audit --no-fund

COPY app ./app
COPY src ./src
COPY assets ./assets
COPY plugins ./plugins
COPY app.json package.json package-lock.json tsconfig.json metro.config.js ./
RUN npx expo export --platform web --output-dir dist-web

FROM nginx:stable-alpine@sha256:8eb04fe3b385090e9aa02961f77398ad09b6bf33ab07f6669a5bb7acce22c0d3
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-web /usr/share/nginx/html
EXPOSE 8080
