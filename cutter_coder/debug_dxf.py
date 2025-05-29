#!/usr/bin/env python3
import ezdxf
import sys

def analyze_dxf(file_path):
    doc = ezdxf.readfile(file_path)
    msp = doc.modelspace()
    
    lines = list(msp.query('LINE'))
    arcs = list(msp.query('ARC'))
    polylines = list(msp.query('LWPOLYLINE'))
    circles = list(msp.query('CIRCLE'))
    
    print(f"DXF Analysis for: {file_path}")
    print(f"Lines: {len(lines)}")
    print(f"Arcs: {len(arcs)}")
    print(f"Polylines: {len(polylines)}")
    print(f"Circles: {len(circles)}")
    
    # Show sample line coordinates
    if lines:
        print("\nFirst 5 lines:")
        for i, line in enumerate(lines[:5]):
            start = line.dxf.start
            end = line.dxf.end
            print(f"  Line {i}: ({start.x:.2f}, {start.y:.2f}) -> ({end.x:.2f}, {end.y:.2f})")
    
    # Show sample arc data
    if arcs:
        print("\nFirst 5 arcs:")
        for i, arc in enumerate(arcs[:5]):
            center = arc.dxf.center
            print(f"  Arc {i}: center=({center.x:.2f}, {center.y:.2f}) radius={arc.dxf.radius:.2f} angles={arc.dxf.start_angle:.1f}-{arc.dxf.end_angle:.1f}")
    
    # Check connectivity
    print("\nChecking connectivity...")
    endpoints = {}
    for line in lines:
        start = (round(line.dxf.start.x, 3), round(line.dxf.start.y, 3))
        end = (round(line.dxf.end.x, 3), round(line.dxf.end.y, 3))
        
        if start not in endpoints:
            endpoints[start] = 0
        if end not in endpoints:
            endpoints[end] = 0
        
        endpoints[start] += 1
        endpoints[end] += 1
    
    # Count connection types
    single_endpoints = sum(1 for count in endpoints.values() if count == 1)
    double_endpoints = sum(1 for count in endpoints.values() if count == 2)
    multi_endpoints = sum(1 for count in endpoints.values() if count > 2)
    
    print(f"Endpoints with 1 connection: {single_endpoints}")
    print(f"Endpoints with 2 connections: {double_endpoints}")
    print(f"Endpoints with >2 connections: {multi_endpoints}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_dxf.py <dxf_file>")
        sys.exit(1)
    
    analyze_dxf(sys.argv[1])