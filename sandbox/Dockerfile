# Minimal runtime for the local, development-only execution sandbox.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir pytest==8.*
RUN useradd -u 65534 -M -s /usr/sbin/nologin sandbox || true
WORKDIR /work
USER 65534:65534
