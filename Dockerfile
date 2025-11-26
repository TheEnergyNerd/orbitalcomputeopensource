# Dockerfile for Railway backend deployment
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY backend/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ /app/

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run the application
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

