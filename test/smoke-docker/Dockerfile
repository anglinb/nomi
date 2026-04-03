# Nomi Docker Smoke Test
#
# Proves Nomi can start from raw Ubuntu with zero interaction.
# The frontend bundle (dist/client/) must be pre-built on the host before
# building this image — see smoke-test.sh for the full workflow.

FROM ubuntu:24.04

# Prevent interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Install minimal system dependencies required by the Bun installer and runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun via the official installer
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | bash && bun --version

# Set up working directory
WORKDIR /app

# Copy dependency manifests first (Docker layer caching — only re-runs
# bun install when package.json or bun.lock change, not on source edits)
COPY package.json bun.lock ./

# Skip cloudflared binary download (not needed for smoke test)
ENV CLOUDFLARED_SKIP_INSTALL=1

# Install ONLY production dependencies
RUN bun install --production --frozen-lockfile

# Copy server source (Bun runs TypeScript directly, no compile step)
COPY bin/ ./bin/
COPY src/server/ ./src/server/
COPY src/shared/ ./src/shared/

# Copy pre-built frontend bundle
COPY dist/client/ ./dist/client/

# Disable self-update checks inside the container
ENV NOMI_DISABLE_SELF_UPDATE=1

# Default Nomi port
EXPOSE 3210

# Start the server directly via cli.ts, bypassing the supervisor.
# --remote     → bind 0.0.0.0 (reachable from Docker host)
# --no-open    → don't attempt xdg-open in headless container
# --strict-port → fail immediately if port 3210 is unavailable
CMD ["bun", "run", "./src/server/cli.ts", "--remote", "--no-open", "--strict-port"]
