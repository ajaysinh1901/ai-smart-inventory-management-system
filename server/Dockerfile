# Multi-stage Dockerfile for the SmartStock AI backend.
# Used by Fly.io / any container host. Render uses its native Node buildpack
# (no Dockerfile needed).

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Tesseract.js loads native binaries lazily, but pdfkit + bcryptjs build cleanly
# on slim. Install only production deps for a smaller final image.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Non-root user for safety
RUN groupadd -r app && useradd -r -g app app

# Copy production deps + source
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app . .

USER app

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check matches the Express /api/v1/health route
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
