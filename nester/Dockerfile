FROM ubuntu:22.04

# Avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    cmake \
    git \
    libeigen3-dev \
    libboost-all-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install ezdxf shapely numpy

# Create app directory
WORKDIR /app

# Copy source code
COPY nest.py /app/nest.py

# Create input/output directories
RUN mkdir -p /app/input /app/output

# Set the default command
CMD ["python3", "/app/nest.py"]