#!/usr/bin/env python3
"""
Test script to run unfold.py without needing FreeCAD CLI.
This script sets up the FreeCAD environment and runs the unfold functionality.
"""

import os
import sys
import tempfile
import shutil
from pathlib import Path

# Add the sheet_metal folder to Python path
sheet_metal_path = os.path.join(os.path.dirname(__file__), 'src', 'sheet_metal')
sys.path.insert(0, sheet_metal_path)

# Try to import FreeCAD
try:
    import FreeCAD
    import FreeCADGui
    print("✓ FreeCAD imported successfully")
except ImportError:
    print("✗ FreeCAD not found. You need to install FreeCAD and make it available to Python.")
    print("Options:")
    print("1. Install FreeCAD system-wide: sudo apt-get install freecad")
    print("2. Use FreeCAD's Python: /usr/lib/freecad/bin/python TEST.py")
    print("3. Add FreeCAD to PYTHONPATH: export PYTHONPATH=/usr/lib/freecad/lib:$PYTHONPATH")
    sys.exit(1)

def test_unfold(step_file_path, k_factor=0.38, output_dir=None):
    """
    Test the unfold functionality with a STEP file.
    
    Args:
        step_file_path: Path to the STEP file to unfold
        k_factor: K-factor for bend calculations (default: 0.38)
        output_dir: Directory to save output files (default: temp directory)
    """
    print(f"\n=== Testing Unfold Functionality ===")
    print(f"Input STEP file: {step_file_path}")
    print(f"K-factor: {k_factor}")
    
    if not os.path.exists(step_file_path):
        print(f"✗ Error: STEP file not found: {step_file_path}")
        return False
    
    # Create output directory
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="unfold_test_")
    os.makedirs(output_dir, exist_ok=True)
    print(f"Output directory: {output_dir}")
    
    try:
        # Create a new FreeCAD document
        print("\n1. Creating FreeCAD document...")
        doc = FreeCAD.newDocument("UnfoldTest")
        
        # Import STEP file
        print("2. Importing STEP file...")
        import Import
        Import.insert(step_file_path, doc.Name)
        
        # Get the imported object
        if len(doc.Objects) == 0:
            print("✗ Error: No objects imported from STEP file")
            return False
        
        obj = doc.Objects[0]
        print(f"✓ Imported object: {obj.Name}")
        
        # Import necessary modules for unfolding
        print("\n3. Loading SheetMetal modules...")
        import importDXF
        import Part
        import SheetMetalNewUnfolder
        
        # Get the largest face as the base face
        print("4. Finding base face...")
        faces = obj.Shape.Faces
        largest_face = max(faces, key=lambda f: f.Area)
        base_index = faces.index(largest_face)
        facename = f"Face{base_index + 1}"
        print(f"✓ Using face: {facename} (area: {largest_face.Area:.2f} mm²)")
        
        # Create bend allowance calculator
        print(f"\n5. Creating bend allowance calculator (K-factor: {k_factor})...")
        bac = SheetMetalNewUnfolder.BendAllowanceCalculator.from_single_value(k_factor, "ansi")
        
        # Perform unfolding
        print("6. Unfolding sheet metal...")
        try:
            sel_face, unfolded_shape, bend_lines, root_normal = SheetMetalNewUnfolder.getUnfold(
                bac, obj, facename
            )
            print("✓ Unfolding successful")
        except Exception as e:
            print(f"✗ Error during unfolding: {e}")
            return False
        
        # Create unfolded object
        print("\n7. Creating unfolded object...")
        unfold_obj = doc.addObject("Part::Feature", "UnfoldedPart")
        unfold_obj.Shape = unfolded_shape
        doc.recompute()
        
        # Get the largest face from unfolded object
        faces = unfold_obj.Shape.Faces
        largest_face = max(faces, key=lambda f: f.Area)
        
        # Create face object for export
        part = doc.addObject("Part::Feature", "LargestFace")
        part.Shape = largest_face
        doc.recompute()
        
        # Export to DXF
        print("8. Exporting to DXF...")
        dxf_path = os.path.join(output_dir, "unfolded.dxf")
        try:
            importDXF.export([part], dxf_path)
            print(f"✓ DXF exported to: {dxf_path}")
        except Exception as e:
            print(f"✗ Error exporting DXF: {e}")
        
        # Export to STEP
        print("9. Exporting to STEP...")
        step_path = os.path.join(output_dir, "unfolded.step")
        try:
            Part.export([unfold_obj], step_path)
            print(f"✓ STEP exported to: {step_path}")
        except Exception as e:
            print(f"✗ Error exporting STEP: {e}")
        
        # Print summary
        print(f"\n=== Summary ===")
        print(f"✓ Unfolding completed successfully")
        print(f"✓ Original thickness estimate: {SheetMetalNewUnfolder.EstimateThickness.from_normal_edges(obj.Shape, base_index):.2f} mm")
        print(f"✓ Output files saved to: {output_dir}")
        
        # List output files
        print("\nGenerated files:")
        for file in os.listdir(output_dir):
            file_path = os.path.join(output_dir, file)
            size = os.path.getsize(file_path)
            print(f"  - {file} ({size} bytes)")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Close the document
        try:
            FreeCAD.closeDocument(doc.Name)
        except:
            pass


def main():
    """Main function to run tests."""
    print("=== FreeCAD Sheet Metal Unfolder Test ===")
    print(f"Python: {sys.version}")
    print(f"FreeCAD: {FreeCAD.Version()[0]}.{FreeCAD.Version()[1]}")
    print(f"Working directory: {os.getcwd()}")
    
    # Check if a STEP file was provided
    if len(sys.argv) > 1:
        step_file = sys.argv[1]
        k_factor = float(sys.argv[2]) if len(sys.argv) > 2 else 0.38
        output_dir = sys.argv[3] if len(sys.argv) > 3 else None
    else:
        # Look for test STEP files
        test_files = []
        for ext in ['*.step', '*.stp', '*.STEP', '*.STP']:
            test_files.extend(Path('.').glob(ext))
        
        if test_files:
            print("\nFound STEP files:")
            for i, f in enumerate(test_files):
                print(f"  {i+1}. {f}")
            
            choice = input("\nSelect a file (number) or enter path: ").strip()
            
            if choice.isdigit() and 1 <= int(choice) <= len(test_files):
                step_file = str(test_files[int(choice)-1])
            else:
                step_file = choice
        else:
            print("\nUsage: python TEST.py <step_file> [k_factor] [output_dir]")
            print("\nExample: python TEST.py model.step 0.38 ./output")
            print("\nNo STEP files found in current directory.")
            return
        
        k_factor = 0.38
        output_dir = None
    
    # Run the test
    success = test_unfold(step_file, k_factor, output_dir)
    
    if success:
        print("\n✓ Test completed successfully!")
    else:
        print("\n✗ Test failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()