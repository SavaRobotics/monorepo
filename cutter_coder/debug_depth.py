#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app/src')

from materials.database import get_material_settings
from operations.contouring import ContouringOperation

# Test contouring with 10mm thickness
material_settings = get_material_settings("aluminum")
contouring_op = ContouringOperation(material_settings)

# Simple square contour
test_contour = [
    (0, 0),
    (100, 0),
    (100, 100),
    (0, 100),
    (0, 0)
]

# Generate toolpath for 10mm thickness
print("Testing 10mm aluminum contouring...")
print(f"Depth per pass: {material_settings['operations']['contouring']['depth_per_pass']}mm")

toolpaths = contouring_op.generate_toolpath(
    part_contour=test_contour,
    material_thickness=10.0,
    tabs=None,  # No tabs for clearer output
    is_climb=True
)

# Analyze depths
depths = set()
for move in toolpaths:
    if 'depth' in move:
        depths.add(move['depth'])

print(f"\nGenerated {len(toolpaths)} moves")
print(f"Unique depths found: {sorted(depths)}")

# Show some sample moves at each depth
for depth in sorted(depths):
    moves_at_depth = [m for m in toolpaths if m.get('depth') == depth]
    print(f"\nDepth {depth}mm: {len(moves_at_depth)} moves")
    if moves_at_depth and moves_at_depth[0].get('type'):
        print(f"  First move type: {moves_at_depth[0]['type']}")