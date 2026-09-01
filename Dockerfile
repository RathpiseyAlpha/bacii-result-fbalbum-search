# syntax=docker/dockerfile:1.7

# Keep this tag aligned with the Playwright version resolved in package-lock.json.
ARG PLAYWRIGHT_VERSION=1.62.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/app/.venv \
    PATH=/app/.venv/bin:$PATH \
    OCR_PYTHON=/app/.venv/bin/python \
    TESSERACT_CMD=/usr/bin/tesseract \
    DATABASE_PATH=/app/data/album-packer.sqlite \
    HF_HOME=/app/.cache/huggingface \
    TMPDIR=/app/tmp \
    PORT=8787

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      build-essential \
      curl \
      python3 \
      python3-pip \
      python3-venv \
      tesseract-ocr \
      tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY ocr/requirements.txt ./ocr/requirements.txt
RUN python3 -m venv "$VIRTUAL_ENV" \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch>=2.4,<3" \
    && pip install --no-cache-dir -r ocr/requirements.txt

COPY . .
RUN npm run build \
    && python ocr/worker.py --check \
    && mkdir -p /app/data /app/.cache/huggingface /app/tmp

ENV NODE_ENV=production

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8787/api/health || exit 1

CMD ["npm", "start"]
