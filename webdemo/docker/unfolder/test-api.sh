#!/bin/bash

# Test script for the FreeCAD Unfolder API

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== FreeCAD Unfolder API Test Script ==="
echo ""

# Base URL
BASE_URL="http://localhost:5001"

# Test 1: Health Check
echo "1. Testing health endpoint..."
response=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    curl -s "${BASE_URL}/health" | python3 -m json.tool
else
    echo -e "${RED}✗ Health check failed (HTTP $response)${NC}"
fi
echo ""

# Test 2: API Info
echo "2. Testing root endpoint (API info)..."
response=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✓ API info endpoint passed${NC}"
    curl -s "${BASE_URL}/" | python3 -m json.tool
else
    echo -e "${RED}✗ API info endpoint failed (HTTP $response)${NC}"
fi
echo ""

# Test 3: Unfold with sample STEP URL
echo "3. Testing unfold endpoint with sample STEP file..."
# You'll need to provide a valid STEP file URL for testing
# This is just an example - replace with your actual STEP file URL
SAMPLE_STEP_URL="https://example.com/sample.step"

echo "   NOTE: You need to replace the sample URL with a real STEP file URL"
echo "   Example: SAMPLE_STEP_URL=\"https://your-domain.com/your-file.step\""
echo ""
echo "   To test with a STEP file, run:"
echo "   curl -O -J \"${BASE_URL}/unfold?url=<YOUR_STEP_FILE_URL>\""

# Uncomment and modify this when you have a real STEP file URL:
# curl -s -f -o "unfolded_test.dxf" \
#      "${BASE_URL}/unfold?url=${SAMPLE_STEP_URL}&k_factor=0.4" \
#      -w "\n   HTTP Status: %{http_code}\n   Download Size: %{size_download} bytes\n   Time: %{time_total}s\n"

# Check if file was created (uncomment when testing with real STEP file)
# if [ $? -eq 0 ] && [ -f "unfolded_test.dxf" ]; then
#     echo -e "${GREEN}✓ Unfold successful!${NC}"
#     echo "   Output saved to: unfolded_test.dxf"
#     echo "   File size: $(ls -lh unfolded_test.dxf | awk '{print $5}')"
#     echo ""
#     echo "   First 10 lines of DXF file:"
#     head -n 10 unfolded_test.dxf
# else
#     echo -e "${RED}✗ Unfold failed${NC}"
# fi
echo ""

# Test 4: Error handling - missing URL parameter
echo "4. Testing error handling (missing URL parameter)..."
response=$(curl -s "${BASE_URL}/unfold")
echo "   Response: $response"
echo ""

# Test 5: Test with your actual STEP file
echo "5. Test with your own STEP file"
echo "   To test with your own STEP file, run:"
echo "   curl -O -J \"${BASE_URL}/unfold?url=<YOUR_STEP_URL>\""
echo ""
echo "   Example with k_factor:"
echo "   curl -O -J \"${BASE_URL}/unfold?url=<YOUR_STEP_URL>&k_factor=0.45\""
echo ""
echo "   Example saving with specific filename:"
echo "   curl -o my-unfolded.dxf \"${BASE_URL}/unfold?url=<YOUR_STEP_URL>\""

echo ""
echo "=== Test Complete ===""