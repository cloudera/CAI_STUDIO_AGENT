# Stage 1: Build stage
FROM docker-private.infra.cloudera.com/cloudera/cdsw/ml-runtime-pbj-workbench-python3.10-standard:2025.09.1-b5 AS builder

USER root
WORKDIR /studio_app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv==0.5.29

# Install NVM and Node.js 22 in current working directory
# Create NVM directory first, then install NVM to that location
RUN export NVM_DIR="/studio_app/.nvm" && \
    mkdir -p "$NVM_DIR" && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | NVM_DIR="$NVM_DIR" bash && \
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && \
    nvm install 22 && \
    nvm use 22 && \
    nvm alias default 22 && \
    # Create symlinks to make node and npm available globally
    ln -s "$NVM_DIR/versions/node/$(nvm version default)/bin/node" /usr/local/bin/node && \
    ln -s "$NVM_DIR/versions/node/$(nvm version default)/bin/npm" /usr/local/bin/npm

# Set NVM environment variable for future shell sessions
ENV NVM_DIR="/studio_app/.nvm"

# Copy source code
COPY . .

# Install Python dependencies WITHOUT --all-extras (no extras defined anyway)
RUN uv sync --no-dev

# Install Node.js dependencies
RUN npm install

# Build Next.js application
RUN npm run build

# Clean up build artifacts
RUN rm -rf node_modules && npm cache clean --force

# Create workflow engine virtual environment
RUN cd studio/workflow_engine && \
    uv venv && \
    VIRTUAL_ENV=.venv uv sync --no-dev

# Stage 2: Runtime stage
FROM docker-private.infra.cloudera.com/cloudera/cdsw/ml-runtime-pbj-workbench-python3.10-standard:2025.09.1-b5

USER root
RUN mkdir -p /studio_app && chown cdsw:cdsw /studio_app
WORKDIR /studio_app

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install only uv in runtime
RUN pip install uv==0.5.29
# Fixing ubuntu 24 CVEs
RUN apt-get --assume-yes --purge remove libopenmpt0t64 emacs-common emacs-el emacs-bin-common \
    libswresample4 libavdevice60 ffmpeg libswscale7 libpostproc57 libavutil58 libavcodec60 \
    libavfilter9 libavformat60 libjxl0.7

# Copy everything from builder with correct permissions
COPY --from=builder --chown=cdsw:cdsw --chmod=755 /studio_app /studio_app

# Remove what we don't need in runtime and do minimal permission fixes
RUN rm -rf \
        /studio_app/.git \
        /studio_app/docs \
        /studio_app/tests \
        /studio_app/.pytest_cache \
        /studio_app/__pycache__ \
        /studio_app/node_modules \
        /studio_app/eslint.config.mjs \
        /studio_app/tailwind.config.js \
        /studio_app/tsconfig.json \
        /studio_app/postcss.config.js \
        /studio_app/components.json \
        /studio_app/.prettierrc \
        /studio_app/next.config.ts

RUN export NVM_DIR="/studio_app/.nvm" && \
    mkdir -p "$NVM_DIR" && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | NVM_DIR="$NVM_DIR" bash && \
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && \
    nvm install 22 && \
    nvm use 22 && \
    nvm alias default 22 && \
    npm ci --only=production && npm cache clean --force
    

ARG RT_SHORT_VERSION=unspecified
ARG RT_GIT_HASH=unspecified
ARG RT_GBN=unspecified
ARG RT_BUILD_NUMBER=unspecified
ARG ML_RUNTIME_EDITION="Agent Studio"
# Set environment variables
ENV AGENT_STUDIO_DEPLOY_MODE=runtime
ENV IS_COMPOSABLE=true
ENV APP_DIR=/studio_app
ENV PATH="/studio_app/.venv/bin:$PATH"
ENV APP_DATA_DIR=/home/cdsw/agent-studio

ENV ML_RUNTIME_EDITION=$ML_RUNTIME_EDITION \
    ML_RUNTIME_DESCRIPTION="Agent Studio runtime provided by Cloudera" \
    ML_RUNTIME_KERNEL="Agent Studio" \
    ML_RUNTIME_METADATA_VERSION=2 \ 
    ML_RUNTIME_FULL_VERSION="$RT_SHORT_VERSION.$RT_BUILD_NUMBER" \
    ML_RUNTIME_SHORT_VERSION=$RT_SHORT_VERSION \
    ML_RUNTIME_MAINTENANCE_VERSION=$RT_BUILD_NUMBER \
    ML_RUNTIME_GIT_HASH=$RT_GIT_HASH \
    ML_RUNTIME_GBN=$RT_GBN

LABEL \
    com.cloudera.ml.runtime.runtime-metadata-version=$ML_RUNTIME_METADATA_VERSION \
    com.cloudera.ml.runtime.edition=$ML_RUNTIME_EDITION \
    com.cloudera.ml.runtime.description=$ML_RUNTIME_DESCRIPTION \
    com.cloudera.ml.runtime.full-version=$ML_RUNTIME_FULL_VERSION \
    com.cloudera.ml.runtime.short-version=$ML_RUNTIME_SHORT_VERSION \
    com.cloudera.ml.runtime.kernel=$ML_RUNTIME_KERNEL \
    com.cloudera.ml.runtime.maintenance-version=$ML_RUNTIME_MAINTENANCE_VERSION \
    com.cloudera.ml.runtime.git-hash=$ML_RUNTIME_GIT_HASH \
    com.cloudera.ml.runtime.gbn=$ML_RUNTIME_GBN