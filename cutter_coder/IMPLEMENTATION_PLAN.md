# DXF to G-Code Converter Implementation Plan

## Overview
Create a Docker-based service that converts nested DXF files into G-code for CNC routing, leveraging the PyCAM library's capabilities.

## Architecture

### 1. Core Components
- **DXF Processor**: Handle DXF file parsing and validation
- **Material Manager**: Configure material properties and thickness
- **Tab Generator**: Create holding tabs for nested parts
- **Toolpath Generator**: Generate optimized toolpaths for routing
- **G-code Exporter**: Export final G-code with proper formatting

### 2. Technology Stack
- **Language**: Python 3.x
- **DXF Processing**: PyCAM's DXFImporter
- **G-code Generation**: PyCAM's GCodeExporter
- **API Framework**: FastAPI for REST endpoints
- **Container**: Docker with Alpine Linux base

### 3. Project Structure
```
cutter_coder/
├── Dockerfile
├── requirements.txt
├── docker-compose.yml
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   ├── dxf_processor.py     # DXF file handling
│   ├── material_config.py   # Material properties
│   ├── tab_generator.py     # Tab generation logic
│   ├── toolpath_generator.py # Toolpath creation
│   ├── gcode_exporter.py    # G-code export
│   └── utils.py             # Utility functions
├── templates/
│   └── default_config.yml   # Default YAML flow template
├── tests/
│   ├── test_dxf_processor.py
│   ├── test_toolpath.py
│   └── sample_files/
│       └── test.dxf
└── README.md
```

### 4. API Endpoints
- `POST /convert` - Convert DXF to G-code
  - Input: DXF file, material config, routing parameters
  - Output: G-code file
- `GET /health` - Health check
- `POST /validate` - Validate DXF file
- `GET /materials` - List available material presets

### 5. Key Features Implementation

#### A. DXF Processing
- Use PyCAM's DXFImporter to parse DXF files
- Validate nested geometry
- Extract contours, holes, and slots
- Optimize line segments for efficient routing

#### B. Material Configuration
```yaml
material:
  type: "plywood"
  thickness: 12.0  # mm
  feedrate: 1000   # mm/min
  plunge_rate: 300 # mm/min
  spindle_speed: 18000 # RPM
```

#### C. Tab Generation
- Use PyCAM's ModelSupportDistributed for automatic tab placement
- Configure tab dimensions (width, height, spacing)
- Ensure parts remain connected during cutting

#### D. Toolpath Generation
- Contour following for outside cuts
- Pocket operations for inside cuts
- Hole drilling cycles
- Tool compensation handling

#### E. G-code Export
- Safety height management
- Tool change sequences
- Spindle control
- Feed rate optimization

### 6. Docker Configuration
- Base image: python:3.11-alpine
- Install PyCAM dependencies
- Expose port 8000 for API
- Volume mount for input/output files

### 7. Usage Workflow
1. User uploads DXF file via API
2. System validates DXF geometry
3. User configures material and routing parameters
4. System generates toolpaths with tabs
5. System exports optimized G-code
6. User downloads G-code file

### 8. Configuration via YAML
Leverage PyCAM's YAML flow system for configurable workflows:
```yaml
models:
  - name: "input_dxf"
    source: {type: "file", location: "input.dxf"}

tools:
  - name: "router_bit"
    shape: {type: "cylindrical", radius: 3.175, height: 25}

processes:
  - name: "contour_cut"
    strategy: {type: "contour-follow"}
    parameters:
      material_allowance: 0.1
      step_down: 3.0

tasks:
  - name: "cut_parts"
    tool: "router_bit"
    process: "contour_cut"
    bounds: {type: "stock", dimensions: [600, 400, 12]}
```

### 9. Error Handling
- Validate DXF file format and geometry
- Check for self-intersecting paths
- Verify material thickness compatibility
- Handle tool collision detection

### 10. Testing Strategy
- Unit tests for each component
- Integration tests with sample DXF files
- Docker container build tests
- API endpoint tests
- G-code validation tests

## Next Steps
1. Set up project structure
2. Create Docker configuration
3. Implement core DXF processing
4. Add material and tab configuration
5. Integrate PyCAM toolpath generation
6. Build API endpoints
7. Create comprehensive tests
8. Document usage and examples