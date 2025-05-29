#!/usr/bin/env python3
"""Command-line interface for DXF to G-code conversion"""

import argparse
import sys
from pathlib import Path

from src.main import process_dxf_file

def main():
    parser = argparse.ArgumentParser(
        description="Convert DXF files with nested parts to Mach3 G-code"
    )
    
    parser.add_argument(
        "input",
        type=str,
        help="Input DXF file path"
    )
    
    parser.add_argument(
        "-o", "--output",
        type=str,
        help="Output G-code file path (default: input_file.nc)"
    )
    
    parser.add_argument(
        "-m", "--material",
        type=str,
        default="aluminum",
        choices=["aluminum", "galvanized_steel"],
        help="Material type (default: aluminum)"
    )
    
    parser.add_argument(
        "-t", "--thickness",
        type=float,
        default=3.0,
        help="Material thickness in mm (default: 3.0)"
    )
    
    parser.add_argument(
        "-d", "--tool-diameter",
        type=float,
        default=6.35,
        help="Tool diameter in mm (default: 6.35)"
    )
    
    parser.add_argument(
        "--no-tabs",
        action="store_true",
        help="Disable tab generation"
    )
    
    args = parser.parse_args()
    
    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file '{args.input}' not found")
        sys.exit(1)
    
    if not input_path.suffix.lower() == '.dxf':
        print("Error: Input file must be a DXF file")
        sys.exit(1)
    
    # Determine output path
    if args.output:
        output_path = args.output
    else:
        output_path = input_path.with_suffix('.nc')
    
    # Process file
    print(f"Processing {input_path.name}...")
    print(f"Material: {args.material}")
    print(f"Thickness: {args.thickness}mm")
    print(f"Tool diameter: {args.tool_diameter}mm")
    print(f"Tabs: {'enabled' if not args.no_tabs else 'disabled'}")
    
    success = process_dxf_file(
        dxf_path=str(input_path),
        output_path=str(output_path),
        material=args.material,
        thickness=args.thickness,
        tool_diameter=args.tool_diameter,
        enable_tabs=not args.no_tabs
    )
    
    if success:
        print(f"\nSuccess! G-code written to: {output_path}")
    else:
        print("\nError: Conversion failed")
        sys.exit(1)

if __name__ == "__main__":
    main()