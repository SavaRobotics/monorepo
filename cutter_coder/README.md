# DXF to G-Code Converter

A Docker-based service that converts nested DXF files into G-code for CNC routing operations. This tool is specifically designed for processing nested layouts with automatic tab generation, material configuration, and optimized toolpath generation.

## Features

- **DXF Processing**: Handles nested DXF layouts with multiple parts
- **Automatic Tab Generation**: Creates holding tabs to keep parts in place during cutting
- **Material Presets**: Built-in configurations for common materials (plywood, MDF, aluminum, etc.)
- **Toolpath Optimization**: Minimizes rapid moves and optimizes cutting order
- **REST API**: Simple HTTP API for integration
- **Docker Support**: Easy deployment with Docker

## Quick Start

### Using Docker Compose

```bash
# Clone the repository
cd /path/to/cutter_coder

# Build and start the service
docker-compose up -d

# Check service health
curl http://localhost:8000/health
```

### Using Docker

```bash
# Build the image
docker build -t cutter-coder .

# Run the container
docker run -p 8000:8000 -v $(pwd)/temp:/tmp/cutter_coder cutter-coder
```

## API Endpoints

### 1. Convert DXF to G-Code (Simple)

```bash
curl -X POST "http://localhost:8000/convert" \
  -F "file=@your_nested_layout.dxf" \
  -F "material_preset=plywood_12mm" \
  -F "enable_tabs=true" \
  -o output.gcode
```

Parameters:
- `file`: DXF file (required)
- `material_preset`: Use predefined material settings
- `material_thickness`: Override thickness in mm
- `feed_rate`: Override feed rate in mm/min
- `spindle_speed`: Override spindle speed in RPM
- `tool_diameter`: Tool diameter in mm
- `enable_tabs`: Enable/disable holding tabs
- `tab_height`: Tab height in mm
- `tab_width`: Tab width in mm
- `tab_spacing`: Spacing between tabs in mm

### 2. Validate DXF File

```bash
curl -X POST "http://localhost:8000/validate" \
  -F "file=@your_file.dxf"
```

### 3. Get Material Presets

```bash
curl http://localhost:8000/materials
```

### 4. Convert with Advanced Configuration

```bash
curl -X POST "http://localhost:8000/convert/advanced" \
  -F "file=@your_file.dxf" \
  -H "Content-Type: application/json" \
  -d '{
    "material_config": {
      "type": "plywood",
      "thickness": 12.0,
      "feed_rate": 1000.0,
      "plunge_rate": 300.0,
      "spindle_speed": 18000,
      "step_down": 3.0
    },
    "tool_config": {
      "type": "end_mill",
      "diameter": 6.35,
      "flute_length": 25.0
    },
    "tab_config": {
      "enabled": true,
      "height": 3.0,
      "width": 8.0,
      "spacing": 100.0
    }
  }'
```

## Material Presets

| Preset | Thickness | Feed Rate | Plunge Rate | Spindle Speed | Step Down |
|--------|-----------|-----------|-------------|---------------|-----------|
| plywood_12mm | 12mm | 1000 mm/min | 300 mm/min | 18000 RPM | 3mm |
| mdf_18mm | 18mm | 800 mm/min | 250 mm/min | 16000 RPM | 4mm |
| aluminum_6mm | 6mm | 300 mm/min | 100 mm/min | 10000 RPM | 0.5mm |

## DXF Requirements

The service expects DXF files with the following structure:
- Parts should be on a layer (default: "LargestFace")
- Sheet boundary on "BOUNDARY" layer (optional)
- Closed contours for each part
- Supports LINE, ARC, CIRCLE, and LWPOLYLINE entities

## G-Code Output

The generated G-code includes:
- Safety height management
- Spindle control with startup delay
- Feed rate optimization
- Tab generation for part holding
- Multiple depth passes based on material thickness
- Optimized rapid movements

## Development

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
python -m uvicorn src.main:app --reload
```

### Running Tests

```bash
# Run unit tests
pytest tests/

# Test with sample DXF
curl -X POST "http://localhost:8000/convert" \
  -F "file=@tests/sample_files/test.dxf" \
  -o test_output.gcode
```

## Configuration

The application can be configured through environment variables:
- `LOG_LEVEL`: Logging level (default: INFO)
- `MAX_FILE_SIZE`: Maximum upload file size in bytes (default: 50MB)

## Troubleshooting

### Common Issues

1. **No parts found in DXF**
   - Check that parts are on the correct layer
   - Ensure contours are closed
   - Verify DXF is in 2D format

2. **Invalid toolpaths**
   - Check material thickness settings
   - Verify tool diameter is appropriate
   - Ensure tab settings are reasonable

3. **Memory issues with large files**
   - Increase Docker container memory limit
   - Process files in smaller batches

## License

This project is designed for CNC routing operations and material processing.