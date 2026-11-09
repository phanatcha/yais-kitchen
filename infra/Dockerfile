# One image recipe for every Node service. Build from the repo root:
#   docker build -f infra/Dockerfile --build-arg SERVICE=auth .

# Only the package files, so dependencies are installed again only when
# one of them changes.
FROM node:22.23-alpine AS manifests
WORKDIR /app
COPY . .
RUN find . -type f ! -name package.json ! -name package-lock.json -delete

FROM node:22.23-alpine AS deps
WORKDIR /app
COPY --from=manifests /app ./
# No dev tools and no install scripts. The only one is the git hook setup.
RUN npm ci --omit=dev --ignore-scripts

FROM node:22.23-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ARG SERVICE
WORKDIR /app/services/${SERVICE}
USER node
CMD ["node", "src/server.js"]
