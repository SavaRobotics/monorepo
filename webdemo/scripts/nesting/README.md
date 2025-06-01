# DXF Nesting Tool

A Mastra tool for nesting multiple DXF parts on a sheet using advanced packing algorithms to minimize material waste.

## Overview

This tool combines DXF file downloading and nesting functionality. It takes a list of DXF file URLs, downloads them to a temporary directory, and then arranges them optimally on a specified sheet size using a bottom-left fill algorithm with rotation support.

## Files

- `nester.py` - Core Python implementation with DXF processing and nesting algorithms
- `nester.ts` - Mastra tool TypeScript interface that wraps the Python functionality
- `temp/` - Temporary directory for downloaded DXF files and output

## Features

- **Multi-format DXF support**: Handles various DXF entity types (lines, arcs, polylines, circles, etc.)
- **Smart rotation**: Tests 0°, 90°, 180°, and 270° rotations for optimal fit
- **Collision detection**: Uses Shapely polygons for accurate collision detection with spacing buffers
- **Bottom-left fill algorithm**: Efficient packing strategy that minimizes waste
- **Original geometry preservation**: Maintains exact original DXF entities in the output
- **Configurable parameters**: Customizable sheet dimensions and part spacing

## Usage

### TypeScript (Mastra Tool)

```typescript
import { dxfNestingTool } from './nesting/nester';

const result = await dxfNestingTool.execute({
  context: {
    dxfUrls: [
      'https://example.com/part1.dxf',
      'https://example.com/part2.dxf',
      'https://example.com/part1.dxf', // Duplicate for quantity
    ],
    sheetWidth: 1000,  // mm
    sheetHeight: 500,  // mm
    spacing: 2,        // mm
  }
});

console.log(`Utilization: ${result.utilization_percent}%`);
console.log(`Placed: ${result.placed_count}/${result.total_parts} parts`);
console.log(`Output file: ${result.nested_dxf_path}`);
```

### Python (Direct)

```python
import asyncio
from nester import nest_dxf_parts

async def main():
    result = await nest_dxf_parts(
        dxf_urls=[
            'https://example.com/part1.dxf',
            'https://example.com/part2.dxf'
        ],
        sheet_width=1000,
        sheet_height=500,
        spacing=2
    )
    print(f"Utilization: {result['utilization_percent']}%")

asyncio.run(main())
```

## Input Parameters

- `dxfUrls` (required): Array of URLs to DXF files. Duplicate URLs represent multiple quantities.
- `sheetWidth` (default: 1000): Width of the sheet in millimeters
- `sheetHeight` (default: 500): Height of the sheet in millimeters  
- `spacing` (default: 2): Minimum spacing between parts in millimeters

## Output

Returns an object with:
- `utilization_percent`: Percentage of sheet area used by placed parts
- `placed_count`: Number of parts successfully placed
- `total_parts`: Total number of parts attempted
- `unfittable_count`: Number of parts that couldn't fit
- `nested_dxf_path`: Path to the generated nested DXF file
- `message`: Status message
- `error`: Error message (if any)

## Algorithm Details

### Collision Detection
- Extracts collision polygons from DXF entities
- Uses Shapely for precise geometric operations
- Supports both explicit polylines and constructed hulls from line/arc entities

### Nesting Strategy
1. **Preprocessing**: Normalize all parts to origin, calculate dimensions
2. **Sorting**: Order parts by area (largest first)
3. **Placement**: For each part:
   - Try all 4 rotations (0°, 90°, 180°, 270°)
   - Find bottom-left position with no collisions
   - Choose rotation that minimizes total area usage

### Entity Transformation
- Preserves original DXF entities exactly
- Applies same transformations (normalize → rotate → position) to both collision polygons and entities
- Ensures perfect alignment between nesting algorithm and visual output

## Dependencies

### Python
- `ezdxf`: DXF file reading/writing
- `shapely`: Geometric operations
- `numpy`: Numerical operations
- `httpx`: HTTP client for downloading files
- `pathlib`: Path operations

### TypeScript
- `@mastra/core`: Mastra framework
- `zod`: Schema validation
- Node.js built-ins: `child_process`, `fs`, `path`

## Error Handling

- Network failures during download are logged but don't stop processing
- Invalid DXF files are skipped with warnings
- Parts that don't fit are tracked in `unfittable_count`
- Detailed error messages for debugging

## Temporary Files

- Downloaded DXF files are stored in `temp/` directory
- Output nested DXF is saved as `temp/nested_layout.dxf`
- Temp directory is cleared before each operation
- Files persist after operation for inspection/download 