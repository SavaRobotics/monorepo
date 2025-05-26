#!/bin/bash

# Development script

echo "Starting Brain in development mode..."

# Install dependencies in development mode
pip install -e .

# Set development environment variables
export DEBUG=true
export LOG_LEVEL=DEBUG

# Start with hot reload
exec uvicorn brain.main:app --host 0.0.0.0 --port 8000 --reload