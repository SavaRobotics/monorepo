# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    libgeos-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# PyCAM has version issues, so we'll use our own implementation
# If needed in future, can add PyCAM as follows:
# RUN cd /tmp && git clone https://github.com/SebKuzminsky/pycam.git && \
#     cd pycam && python setup.py install

# Copy application code
COPY src/ ./src/
COPY templates/ ./templates/
COPY temp_pycam/ ./temp_pycam/

# Create temp directory and samples directory
RUN mkdir -p /tmp/cutter_coder /app/samples

# Expose port
EXPOSE 9000

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO
ENV MAX_FILE_SIZE=52428800

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:9000/health || exit 1

# Run the application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "9000"]