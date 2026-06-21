FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libsecret-1-0 ca-certificates \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY open-sse/package.json ./open-sse/package.json
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
COPY scripts/native-binary-compat.mjs ./scripts/native-binary-compat.mjs
RUN npm pkg delete scripts.prepare \
  && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY . ./
RUN mkdir -p /app/data && npm run build -- --webpack

FROM node:22-bookworm-slim AS runner-base
WORKDIR /app

LABEL org.opencontainers.image.title="routiform" \
  org.opencontainers.image.description="Routiform — unified AI proxy; route any LLM through one endpoint" \
  org.opencontainers.image.url="https://github.com/linhnguyen-gt/Routiform" \
  org.opencontainers.image.source="https://github.com/linhnguyen-gt/Routiform" \
  org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV PORT=20128
ENV HOSTNAME=0.0.0.0
ENV NODE_OPTIONS="--max-old-space-size=256"

# Data directory inside Docker — must match the volume mount in docker-compose.yml
ENV DATA_DIR=/app/data
RUN apt-get update \
  && apt-get install -y --no-install-recommends libsecret-1-0 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
# Explicitly copy @swc/helpers — not always traced by standalone output but needed at runtime
COPY --from=builder /app/node_modules/@swc/helpers ./node_modules/@swc/helpers
# Explicitly copy pino transport dependencies — pino spawns a worker that requires
# pino-abstract-transport at runtime; Next.js standalone trace does not capture it (#449)
COPY --from=builder /app/node_modules/pino-abstract-transport ./node_modules/pino-abstract-transport
COPY --from=builder /app/node_modules/pino-pretty ./node_modules/pino-pretty
COPY --from=builder /app/node_modules/split2 ./node_modules/split2
COPY --from=builder /app/scripts/run-standalone.mjs ./run-standalone.mjs
COPY --from=builder /app/scripts/runtime-env.mjs ./runtime-env.mjs
COPY --from=builder /app/scripts/bootstrap-env.mjs ./bootstrap-env.mjs
COPY --from=builder /app/scripts/healthcheck.mjs ./healthcheck.mjs
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh \
  && ln -s /app/bin/routiform.mjs /usr/local/bin/routiform

EXPOSE 20128

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "healthcheck.mjs"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "run-standalone.mjs"]

FROM runner-base AS runner-cli

# Install system dependencies required by openclaw (git+ssh references).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates docker.io docker-compose \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system url."https://github.com/".insteadOf "ssh://git@github.com/"

# Install CLI tools globally. Separate layer from apt for better cache reuse.
RUN npm install -g --no-audit --no-fund @openai/codex @anthropic-ai/claude-code droid 2>/tmp/cli-install.log || { cat /tmp/cli-install.log; exit 1; } && npm install -g --no-audit --no-fund openclaw@latest 2>/tmp/openclaw-install.log || echo "openclaw install skipped (non-critical)"

# Install Devin CLI for Linux so Docker users can mount host credentials without
# trying to execute a macOS binary inside the container. Skip the installer's
# interactive `devin setup` step during image build; users can reuse mounted
# credentials at runtime or run setup/login inside a container if needed.
RUN curl -fsSL https://cli.devin.ai/install.sh \
  | sed '/^"\$VERSION_DIR\/bin\/\$COMPILED_BIN_NAME" setup$/d' \
  | bash
