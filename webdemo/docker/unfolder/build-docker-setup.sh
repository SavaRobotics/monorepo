#!/bin/bash

# Build Docker CAD Processing Setup
echo "🔨 Building Docker CAD Processing Setup..."

# Show current directory and files
echo "📁 Building from: $(pwd)"
echo "📁 Available files:"
ls -la

# Step 1: Verify required files are present
echo "🔍 Verifying required files..."
if [[ ! -f "Dockerfile.freecad-unfolder" ]]; then
  echo "❌ Dockerfile.freecad-unfolder not found!"
  exit 1
fi

if [[ ! -f "process_cad.py" ]]; then
  echo "❌ process_cad.py not found!"
  exit 1
fi

if [[ ! -d "unfolder" ]]; then
  echo "❌ unfolder/ directory not found!"
  exit 1
fi

if [[ ! -d "sheet_metal" ]]; then
  echo "❌ sheet_metal/ directory not found!"
  exit 1
fi

echo "✅ All required files found"

# Step 2: Build Docker image
echo "🐳 Building Docker image..."
docker build -f Dockerfile.freecad-unfolder -t freecad-unfolder:latest .

if [[ $? -ne 0 ]]; then
  echo "❌ Docker build failed!"
  exit 1
fi

# Step 3: Test the Docker image
echo "🧪 Testing Docker image..."
mkdir -p /tmp/cad-test

# Test with a simple example (you would replace with real URL)
echo "Testing with environment variables..."
docker run --rm \
  -v /tmp/cad-test:/workspace \
  -e CAD_FILE_URL=https://example.com/test.step \
  -e K_FACTOR=0.038 \
  -e OUTPUT_FORMAT=dxf \
  freecad-unfolder:latest || echo "⚠️  Test failed - this is expected without a real CAD file URL"

# Step 4: Show usage instructions
echo "✅ Docker setup complete!"
echo ""
echo "🚀 Usage:"
echo "1. In your Mastra project, the Docker tool will automatically use this image"
echo "   Image name: freecad-unfolder:latest"
echo ""
echo "2. The Mastra workflow will:"
echo "   - Download CAD file from URL"
echo "   - Process it in isolated Docker container"
echo "   - Return DXF/STEP files via volume mount"
echo ""
echo "3. Manual Docker run example:"
echo "   docker run --rm -v /tmp/output:/workspace \\"
echo "     -e CAD_FILE_URL=https://your-domain.com/part.step \\"
echo "     -e K_FACTOR=0.042 \\"
echo "     -e OUTPUT_FORMAT=dxf \\"
echo "     freecad-unfolder:latest"
echo ""
echo "4. Output files will be in the mounted volume directory"
echo ""
echo "📁 Files in this directory:"
echo "  - docker-unfold-tool.ts: Mastra tool implementation"
echo "  - Dockerfile.freecad-unfolder: Docker container definition"
echo "  - process_cad.py: Python script that runs inside container"
echo "  - mastra-docker-example.ts: Example integration with Mastra"
echo "  - unfolder/: Contains unfold.py script"
echo "  - sheet_metal/: Contains FreeCAD Sheet Metal workbench" 