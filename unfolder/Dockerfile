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
RUN pip3 install networkx ezdxf

# Create app directory
WORKDIR /app

# Copy source code
COPY FreeCAD_sheet_metal/ /app/FreeCAD_sheet_metal/
COPY unfolder_code/ /app/unfolder_code/

# Create input/output directories
RUN mkdir -p /app/input /app/output

# Set Python path
ENV PYTHONPATH=/app