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

# Install Python dependencies
RUN pip3 install networkx ezdxf flask werkzeug requests

# Create app directory
WORKDIR /app

# Copy source code
COPY FreeCAD_sheet_metal/ /app/FreeCAD_sheet_metal/
COPY unfolder_code/ /app/unfolder_code/
COPY api.py /app/api.py

# Create input/output directories
RUN mkdir -p /app/input /app/output

# Set Python path
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

# Start the API server
CMD ["python3", "/app/api.py"]