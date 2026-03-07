# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
FROM node:20-alpine

LABEL org.opencontainers.image.title="Judges"
LABEL org.opencontainers.image.description="39 specialized judges that evaluate AI-generated code for security, cost, and quality"
LABEL org.opencontainers.image.source="https://github.com/KevinRabun/judges"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist/ ./dist/
COPY server.json ./

# Create non-root user
RUN addgroup -S judges && adduser -S judges -G judges
USER judges

ENTRYPOINT ["node", "dist/index.js"]
