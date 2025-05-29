# DXF to Mach3 G-code Converter

Converts DXF files containing nested parts into Mach3-compatible G-code for CNC routing.

## Features

- **2D Operations**: Boring, slotting, and contouring
- **Material Database**: Pre-configured settings for aluminum and galvanized steel
- **Intelligent Tab Generation**: Automatic tab placement for part retention
- **Operation Ordering**: Internal features (holes) processed before contours
- **Optimized for CNC Router**: 24,000 RPM spindle speed

## Quick Start

### Docker

```bash
docker-compose up -d
```

### API Usage

Upload DXF and get G-code:
```bash
curl -X POST "http://localhost:8001/convert" \
  -F "file=@your_nested_parts.dxf" \
  -F "material=aluminum" \
  -F "thickness=3.0" \
  -F "tool_diameter=6.35" \
  -F "enable_tabs=true" \
  -o output.nc
```

### Python Usage

```python
from src.main import process_dxf_file

success = process_dxf_file(
    dxf_path="input/nested_parts.dxf",
    output_path="output/parts.nc",
    material="aluminum",
    thickness=3.0,
    tool_diameter=6.35,
    enable_tabs=True
)
```

## API Endpoints

- `POST /convert` - Convert DXF to G-code
- `GET /materials` - List available materials
- `GET /health` - Health check

## Material Settings

### Aluminum (6061/5052)
- Contouring: 2500 mm/min @ 3mm DOC
- Slotting: 1800 mm/min @ 2.5mm DOC  
- Boring: 2000 mm/min @ 2mm DOC

### Galvanized Steel
- Contouring: 1000 mm/min @ 1.5mm DOC
- Slotting: 700 mm/min @ 1.2mm DOC
- Boring: 800 mm/min @ 1mm DOC

## Configuration

Modify `src/materials/database.py` to add materials or adjust cutting parameters.

## Development

```bash
pip install -r requirements.txt
python -m pytest tests/
```