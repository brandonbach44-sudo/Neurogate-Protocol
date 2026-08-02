# NeuroGate Dockerized Desktop App (Phase 4a of the packaging roadmap)
#
# Bundles the Vite/React frontend and the Express API server into a single
# image so a site can run NeuroGate fully locally, offline, with no data
# ever leaving the machine it runs on. This is the "download and run
# locally for large iEEG/EDF datasets" delivery mode, separate from the
# hosted web version (which keeps the frontend on S3/CloudFront and the
# API on its own EC2 instance, per the AWS migration work).
#
# The image serves the built frontend as static files from the same
# Express server that already handles /api/deidentify and /api/download,
# guarded by SERVE_STATIC=true so this has zero effect on the existing
# hosted deployment's server (see server/index.js).
#
# Build:  docker build -t neurogate .
# Run:    docker run -p 3001:3001 -v neurogate-data:/tmp/neurogate neurogate
# Then open http://localhost:3001

# ── Stage 1: build the frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: install server production dependencies ─────────────────
FROM node:20-alpine AS server-deps
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 3: runtime image ───────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV SERVE_STATIC=true
ENV PORT=3001

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=frontend-build /app/dist ./dist

EXPOSE 3001

CMD ["node", "server/index.js"]
