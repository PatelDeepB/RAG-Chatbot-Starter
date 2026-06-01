# Use official lightweight Python runtime
FROM python:3.10-slim

# Set workspace environment settings
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install compilation essentials (clean up apt list caches afterwards)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install application dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project assets to workspace
COPY . /app/

# Expose standard FastAPI API port
EXPOSE 8000

# Start ASGI Web Server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
