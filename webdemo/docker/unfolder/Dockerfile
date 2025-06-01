 FROM ubuntu:22.04

# Avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install FreeCAD and dependencies
RUN apt-get update && apt-get install -y \
    freecad \
    python3 \
    python3-pip \
    xvfb \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (add requests for our webhook)
RUN pip3 install networkx ezdxf flask werkzeug requests

# Create app directory
WORKDIR /app

# Copy source code (using working structure)
COPY src/ /app/src/

# Create input/output directories
RUN mkdir -p /app/input /app/output

# Set Python path
ENV PYTHONPATH=/app

# Set Supabase environment variables (force rebuild v2)
ENV SUPABASE_URL="https://pynaxyfwywlqfvtjbtuc.supabase.co"
ENV SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg"
ENV K_FACTOR="0.38"

# Copy API server
COPY api.py /app/api.py

# Expose port for API
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"

# Start the API server
CMD ["python3", "/app/api.py"]