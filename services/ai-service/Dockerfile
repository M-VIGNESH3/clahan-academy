# Stage 1: Build virtual environment and download models
FROM python:3.10-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Prefetch/Download Haar Cascade XMLs
RUN python -c "import urllib.request; \
urllib.request.urlretrieve('https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml', 'haarcascade_frontalface_default.xml'); \
urllib.request.urlretrieve('https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_profileface.xml', 'haarcascade_profileface.xml')"

# Stage 2: Runner
FROM python:3.10-slim AS runner
# Upgrade OS packages to address CVEs in Debian base image
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy virtualenv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Haar cascades from builder
COPY --from=builder /app/haarcascade_frontalface_default.xml ./
COPY --from=builder /app/haarcascade_profileface.xml ./

# Copy application files
COPY yolov8n.onnx main.py ./

# Create a non-root user and set permissions
RUN groupadd -g 1000 appgroup && \
    useradd -r -u 1000 -g appgroup appuser && \
    chown -R appuser:appgroup /app
USER appuser

ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
