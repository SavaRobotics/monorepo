FROM ubuntu:22.04

  # Avoid interactive prompts during build
  ENV DEBIAN_FRONTEND=noninteractive

  # Install Python and dependencies
  RUN apt-get update && apt-get install -y \
      python3 \
      python3-pip \
      curl \
      && rm -rf /var/lib/apt/lists/*

  # Install Python dependencies for nesting
  RUN pip3 install ezdxf numpy shapely flask werkzeug requests

  # Create app directory
  WORKDIR /app

  # Copy source code
  COPY nest.py /app/nest.py
  COPY api.py /app/api.py

  # Create input/output directories
  RUN mkdir -p /app/input /app/output

  # Set default environment variables
  ENV SHEET_WIDTH=1000
  ENV SHEET_HEIGHT=500
  ENV PART_SPACING=2.0
  ENV OUTPUT_NAME=nested_layout
  ENV OUTPUT_DIR=/app/output

  # Expose port for API
  EXPOSE 5002


  # Start the API server
  CMD ["python3", "/app/api.py"]