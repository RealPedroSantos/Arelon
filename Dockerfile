FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5175
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5175"]

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS api
WORKDIR /app
COPY scripts/shared-config-api.mjs ./scripts/shared-config-api.mjs
EXPOSE 8787
CMD ["node", "scripts/shared-config-api.mjs"]

FROM node:20-alpine AS arelon-api
WORKDIR /app
COPY scripts/arelon-api-proxy.mjs ./scripts/arelon-api-proxy.mjs
EXPOSE 8789
CMD ["node", "scripts/arelon-api-proxy.mjs"]

FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
