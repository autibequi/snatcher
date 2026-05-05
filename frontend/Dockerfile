# Build stage: roda na arch do host (x86) — npm gera HTML/JS/CSS estatico
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app
COPY package.json .
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Runtime: ARM64 para o Pi
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Injeta GA_MEASUREMENT_ID nos dois entry HTMLs no startup (se configurado)
RUN printf '#!/bin/sh\nif [ -n "$GA_MEASUREMENT_ID" ]; then sed -i "s/__GA_MEASUREMENT_ID__/$GA_MEASUREMENT_ID/g" /usr/share/nginx/html/index.html /usr/share/nginx/html/public.html; fi\n' \
    > /docker-entrypoint.d/15-ga.sh && chmod +x /docker-entrypoint.d/15-ga.sh

# Detecta o resolver DNS do container no startup (gateway Podman/Docker varia por subnet)
RUN printf '#!/bin/sh\nNS=$(grep -m1 nameserver /etc/resolv.conf | awk "{print \\$2}")\nsed -i "s|resolver [^;]*;|resolver $NS valid=10s ipv6=off;|" /etc/nginx/conf.d/default.conf\n' \
    > /docker-entrypoint.d/20-resolver.sh && chmod +x /docker-entrypoint.d/20-resolver.sh

EXPOSE 80
