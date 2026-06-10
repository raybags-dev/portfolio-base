# syntax=docker/dockerfile:1
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Store Playwright browser binaries inside /app so appuser can access them
    PLAYWRIGHT_BROWSERS_PATH=/app/.playwright

WORKDIR /app

# System deps: build tools + Chromium shared libraries needed by Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl libpq-dev \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libpangocairo-1.0-0 libcairo2 libx11-6 libx11-xcb1 libxcb1 \
    libxext6 libxcursor1 libxi6 libxtst6 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

# Download Chromium binaries into PLAYWRIGHT_BROWSERS_PATH (/app/.playwright)
RUN playwright install chromium

COPY . .

# Non-root runtime user — chown covers .playwright binaries too
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
