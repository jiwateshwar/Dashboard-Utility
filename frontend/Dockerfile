FROM node:20-alpine AS build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
# Self-signed cert so nginx can terminate HTTPS on the same port it already
# publishes (Entra ID SSO requires an https:// redirect URI, and this host
# is reached by raw IP, not a domain, so there's no public CA cert option).
ARG TLS_CN=172.25.47.101
RUN apk add --no-cache openssl \
  && mkdir -p /etc/nginx/certs \
  && openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
       -subj "/CN=${TLS_CN}" \
       -addext "subjectAltName=IP:${TLS_CN}" \
       -keyout /etc/nginx/certs/privkey.pem \
       -out /etc/nginx/certs/fullchain.pem
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
