FROM ubuntu:22.04

# Avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install FreeCAD and dependencies
RUN apt-get update && apt-get install -y \
    freecad \
    python3 \
    python3-pip \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (add requests for our webhook)
RUN pip3 install networkx ezdxf flask werkzeug requests

# Create app directory
WORKDIR /app

# Copy source code (using working structure)
COPY src/ /app/src/
COPY api.py /app/api.py

# Create input/output directories
RUN mkdir -p /app/input /app/output

# Set Python path
ENV PYTHONPATH=/app

# Expose port for API
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')"

# Start the API server
CMD ["python3", "/app/api.py"]