#!/bin/bash

# Container startup script

echo "Starting Brain application..."

# Set up directories
mkdir -p /app/logs
mkdir -p /app/data

# Start the main application
exec python -m brain.main