#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app/src')

from core.dxf_parser import DXFParser

# Analyze the nested layout DXF
parser = DXFParser('/tmp/nested_layout_20250528_121849.dxf')
result = parser.parse()

print(f"Total parts found: {len(result['parts'])}")
print(f"Total internal features: {len(result['internal_features'])}")
print()

for i, part in enumerate(result['parts']):
    contour = part['contour']
    holes = part.get('holes', [])
    
    print(f"Part {i+1}:")
    print(f"  Contour type: {contour['type']}")
    if 'area' in part:
        print(f"  Area: {part['area']:.1f} mm²")
    print(f"  Number of holes: {len(holes)}")
    
    if holes:
        for j, hole in enumerate(holes):
            print(f"    Hole {j+1}: {hole['type']}")
    print()

# Check bounds
bounds = result['bounds']
print(f"Sheet bounds:")
print(f"  X: {bounds['min_x']:.1f} to {bounds['max_x']:.1f}")
print(f"  Y: {bounds['min_y']:.1f} to {bounds['max_y']:.1f}")

# The classification logic:
print("\nClassification logic:")
print("1. All contours are sorted by area (largest first)")
print("2. For each contour, check if it's inside any larger contour")
print("3. If inside another → it's a HOLE (cut clockwise)")
print("4. If not inside any → it's a PART boundary (cut counter-clockwise)")