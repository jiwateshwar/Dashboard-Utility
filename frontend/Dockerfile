FROM node:20-alpine AS build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
# TLS cert/key for /etc/nginx/certs is provided at runtime via a mounted
# volume (see docker-compose.yml), not baked into the image — this is a
# self-signed cert for an internal IP, and shouldn't live in a public repo.
# See frontend/certs/README.md for how it's generated and deployed.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
