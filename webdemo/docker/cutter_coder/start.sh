#!/bin/bash

# DXF to G-Code Converter - Quick Start Script

echo "DXF to G-Code Converter - Starting..."

# Create temp directory if it doesn't exist
mkdir -p temp

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose is not installed. Using docker compose command..."
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Build and start the service
echo "Building Docker image..."
$COMPOSE_CMD build

echo "Starting service..."
$COMPOSE_CMD up -d

# Wait for service to be ready
echo "Waiting for service to be ready..."
sleep 5

# Check health
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Service is running at http://localhost:8000"
    echo ""
    echo "API Endpoints:"
    echo "  - Health: http://localhost:8000/health"
    echo "  - Convert: POST http://localhost:8000/convert"
    echo "  - Validate: POST http://localhost:8000/validate" 
    echo "  - Materials: GET http://localhost:8000/materials"
    echo ""
    echo "To convert a DXF file:"
    echo "  curl -X POST http://localhost:8000/convert \\"
    echo "    -F 'file=@your_file.dxf' \\"
    echo "    -F 'material_preset=plywood_12mm' \\"
    echo "    -o output.gcode"
    echo ""
    echo "To stop the service:"
    echo "  $COMPOSE_CMD down"
else
    echo "❌ Service failed to start. Check logs with:"
    echo "  $COMPOSE_CMD logs"
    exit 1
fi